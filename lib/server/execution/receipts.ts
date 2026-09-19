import 'server-only';
import { getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';
import { amountToUiAmountForScaledUiAmountMintWithoutSimulation } from '@solana-program/token-2022';
import { z } from 'zod';
import { addressSchema, rawSchema, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, U64_MAX, USDC_MINT } from '@/lib/server/common';
import { validateSignedTransaction } from './submit';
import { MAINNET_GENESIS_HASH } from '@/lib/server/solana-network';

export { MAINNET_GENESIS_HASH } from '@/lib/server/solana-network';
// RPC JSON uses numeric u64s. Accept only exact safe numbers or canonical strings;
// silently rounding an unsafe JSON number would manufacture settlement evidence.
const rpcInteger = z.union([rawSchema, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String)]);
const chainError = z.union([z.null(), z.string().max(1000), z.record(z.string(), z.unknown())]);
const statusSchema = z.object({ value: z.array(z.object({ slot: rpcInteger, confirmationStatus: z.enum(['processed', 'confirmed', 'finalized']).nullable(), err: chainError }).nullable()).length(1) });
const tokenBalanceSchema = z.object({
  accountIndex: z.number().int().min(0).max(255), mint: addressSchema,
  owner: addressSchema, programId: addressSchema,
  uiTokenAmount: z.object({ amount: rawSchema, decimals: z.number().int().min(0).max(18) }),
});
const transactionSchema = z.object({
  slot: rpcInteger,
  blockTime: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  version: z.literal(0),
  transaction: z.tuple([z.string().max(1644), z.literal('base64')]),
  meta: z.object({
    err: chainError, fee: rpcInteger,
    preBalances: z.array(rpcInteger).min(1).max(256), postBalances: z.array(rpcInteger).min(1).max(256),
    preTokenBalances: z.array(tokenBalanceSchema).max(256), postTokenBalances: z.array(tokenBalanceSchema).max(256),
    loadedAddresses: z.object({ writable: z.array(addressSchema).max(256), readonly: z.array(addressSchema).max(256) }).optional(),
  }),
});
const slotNumber = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const unitContextSchema = z.object({
  source: z.literal('clock-sysvar'), kind: z.literal('scaled'), decimals: z.number().int().min(0).max(18),
  tokenProgram: z.literal(TOKEN_2022_PROGRAM), mintSlot: slotNumber, clockSlot: slotNumber,
  observedAt: z.string().datetime({ offset: true }), unixTimestamp: rawSchema, multiplier: z.number().positive().finite(),
});
export const semanticProofSchema = z.object({
  version: z.literal('jupiter-route-v2-raydium-clmm-v1'), genesisHash: z.literal(MAINNET_GENESIS_HASH), lookupContextSlot: slotNumber.nullable(),
  loadedAddresses: z.object({ writable: z.array(addressSchema).max(256), readonly: z.array(addressSchema).max(256) }),
  source: addressSchema, destination: addressSchema, pool: addressSchema, inputRaw: rawSchema, minimumOutputRaw: rawSchema, tokenFeeRaw: rawSchema,
  simulationSlot: slotNumber, unitsConsumed: slotNumber, networkFeeLamports: rawSchema, rentLamports: rawSchema, totalSolCostLamports: rawSchema,
  checkedAt: z.string().datetime({ offset: true }), outputUnitContext: unitContextSchema.optional(), issuerControlled: z.boolean(),
});

export type ReceiptExpectation = {
  wallet: string; signature: string; messageHash: string; transaction: string;
  originalBlockhash: string; inputMint: string; outputMint: string;
  maximumInputRaw: string; minimumOutputRaw: string; maximumTotalSolCostLamports: string;
  semanticProof?: unknown;
};
export type ReceiptVerification = {
  state: 'confirmed' | 'failed-onchain' | 'confirming' | 'unknown';
  message: string;
  evidence: Record<string, unknown>;
};

function result(state: ReceiptVerification['state'], message: string, evidence: Record<string, unknown> = {}): ReceiptVerification {
  return { state, message, evidence: { ...evidence, reason: message } };
}

/** Verify the original signed message and observed raw deltas before calling a purchase complete. */
export async function verifyExecutionReceipt(payload: { genesisHash: unknown; statuses: unknown; transaction: unknown }, expected: ReceiptExpectation): Promise<ReceiptVerification> {
  if (payload.genesisHash !== MAINNET_GENESIS_HASH) return result('unknown', 'The receipt RPC is not verified as Solana mainnet. No replacement order was created.');
  const status = statusSchema.safeParse(payload.statuses);
  if (!status.success) return result('unknown', 'Solana signature status is incomplete. Reconcile this original signature again later.');
  const receipt = status.data.value[0];
  if (!receipt) return result('unknown', 'Solana history does not contain this signature yet. Its settlement remains unknown.');
  if (receipt.confirmationStatus !== 'confirmed' && receipt.confirmationStatus !== 'finalized') return result('confirming', 'The original signature is still being confirmed.');
  const parsed = transactionSchema.safeParse(payload.transaction);
  if (!parsed.success) return result('unknown', 'The confirmed signature has no complete transaction and balance evidence yet.');
  const transaction = parsed.data;
  if (transaction.slot !== receipt.slot) return result('unknown', 'The signature and transaction records disagree about their confirmation slot.');
  try {
    const signed = await validateSignedTransaction(expected, transaction.transaction[0], expected.wallet);
    if (signed.chainSignature !== expected.signature) return result('unknown', 'The returned transaction does not match the original signature.');
    const decoded = getTransactionDecoder().decode(Buffer.from(transaction.transaction[0], 'base64'));
    const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
    if (!('lifetimeToken' in message) || message.lifetimeToken !== expected.originalBlockhash || message.staticAccounts[0] !== expected.wallet) return result('unknown', 'The returned transaction does not match the approved wallet or lifetime.');
    if (message.version !== 0) return result('unknown', 'This receipt requires an unsupported transaction version.');
    const parsedProof = expected.semanticProof == null ? undefined : semanticProofSchema.safeParse(expected.semanticProof);
    if (parsedProof && !parsedProof.success) return result('unknown', 'The original semantic validation proof is incomplete.');
    const proof = parsedProof?.data;
    const lookups = message.addressTableLookups ?? [];
    if (lookups.length && !proof) return result('unknown', 'This lookup-table receipt needs its original approved account resolution.');
    if (proof && (proof.inputRaw !== expected.maximumInputRaw || proof.minimumOutputRaw !== expected.minimumOutputRaw || (lookups.length > 0 && proof.lookupContextSlot === null))) return result('unknown', 'The original validation proof does not match the preserved contribution limits.');
    const meta = transaction.meta;
    const approvedLoaded = proof?.loadedAddresses ?? { writable: [], readonly: [] };
    const actualLoaded = meta.loadedAddresses ?? { writable: [], readonly: [] };
    if (approvedLoaded.writable.length !== lookups.reduce((count, lookup) => count + lookup.writableIndexes.length, 0)
      || approvedLoaded.readonly.length !== lookups.reduce((count, lookup) => count + lookup.readonlyIndexes.length, 0)
      || JSON.stringify(approvedLoaded.writable) !== JSON.stringify(actualLoaded.writable)
      || JSON.stringify(approvedLoaded.readonly) !== JSON.stringify(actualLoaded.readonly)) return result('unknown', 'The confirmed lookup addresses differ from the original approved account resolution.');
    const accountKeys = [...message.staticAccounts, ...approvedLoaded.writable, ...approvedLoaded.readonly];
    if (new Set(accountKeys).size !== accountKeys.length || meta.preBalances.length !== accountKeys.length || meta.postBalances.length !== accountKeys.length) return result('unknown', 'The transaction account and balance records are incomplete.');
    const common = { signature: expected.signature, transactionMessageHash: expected.messageHash, signedTransactionHash: signed.signedTransactionHash, originalBlockhash: expected.originalBlockhash, genesisHash: MAINNET_GENESIS_HASH, confirmationStatus: receipt.confirmationStatus, slot: transaction.slot, feeLamports: meta.fee, blockTime: transaction.blockTime ?? null, proofAt: new Date().toISOString() };
    if ((receipt.err === null) !== (meta.err === null)) return result('unknown', 'The signature and transaction records disagree about an on-chain error.', common);
    if (meta.err !== null) return result('failed-onchain', 'The original Solana transaction failed on-chain. No replacement purchase was created.', { ...common, metaError: meta.err });
    if (expected.inputMint !== USDC_MINT || !rawSchema.safeParse(expected.maximumInputRaw).success || !rawSchema.safeParse(expected.minimumOutputRaw).success || !rawSchema.safeParse(expected.maximumTotalSolCostLamports).success) return result('unknown', 'The preserved contribution limits cannot be verified.');
    const accountCount = accountKeys.length;
    const pre = tokenBalances(meta.preTokenBalances, accountCount);
    const post = tokenBalances(meta.postTokenBalances, accountCount);
    if (!pre || !post) return result('unknown', 'Token balance evidence contains duplicate or unsupported account records.', common);
    for (const [index, before] of pre) {
      const after = post.get(index);
      if (after && (before.owner !== after.owner || before.mint !== after.mint || before.programId !== after.programId || before.uiTokenAmount.decimals !== after.uiTokenAmount.decimals)) return result('unknown', 'A token account changed identity during the transaction.', common);
    }
    const inputBefore = sumOwned(pre, expected.wallet, expected.inputMint, TOKEN_PROGRAM, 6);
    const inputAfter = sumOwned(post, expected.wallet, expected.inputMint, TOKEN_PROGRAM, 6);
    const outputBefore = sumOwned(pre, expected.wallet, expected.outputMint, TOKEN_2022_PROGRAM);
    const outputAfter = sumOwned(post, expected.wallet, expected.outputMint, TOKEN_2022_PROGRAM);
    if (inputBefore === null || inputAfter === null || outputBefore === null || outputAfter === null) return result('unknown', 'The reviewed token ownership or program could not be verified.', common);
    const inputDebit = inputBefore - inputAfter;
    const outputCredit = outputAfter - outputBefore;
    const solDebit = BigInt(meta.preBalances[0]) - BigInt(meta.postBalances[0]);
    const deltas = { inputMint: expected.inputMint, outputMint: expected.outputMint, inputDebitRaw: inputDebit.toString(), outputCreditRaw: outputCredit.toString(), walletSolDebitLamports: solDebit.toString() };
    if (inputDebit !== BigInt(expected.maximumInputRaw) || inputDebit <= 0n || outputCredit < BigInt(expected.minimumOutputRaw) || outputCredit <= 0n) return result('unknown', 'The observed token deltas do not satisfy the reviewed purchase. Reconcile before taking another action.', { ...common, ...deltas });
    if (proof) {
      const sourceIndex = accountKeys.indexOf(proof.source);
      const destinationIndex = accountKeys.indexOf(proof.destination);
      const sourceBefore = pre.get(sourceIndex); const sourceAfter = post.get(sourceIndex);
      const destinationBefore = pre.get(destinationIndex); const destinationAfter = post.get(destinationIndex);
      const matches = (row: TokenBalance | undefined, mint: string, program: string) => row !== undefined && row.owner === expected.wallet && row.mint === mint && row.programId === program;
      if (sourceIndex < 0 || destinationIndex < 0 || sourceIndex === destinationIndex
        || !matches(sourceBefore, expected.inputMint, TOKEN_PROGRAM) || !matches(sourceAfter, expected.inputMint, TOKEN_PROGRAM)
        || !matches(destinationAfter, expected.outputMint, TOKEN_2022_PROGRAM)
        || (destinationBefore && !matches(destinationBefore, expected.outputMint, TOKEN_2022_PROGRAM))
        || BigInt(sourceBefore!.uiTokenAmount.amount) - BigInt(sourceAfter!.uiTokenAmount.amount) !== inputDebit
        || BigInt(destinationAfter!.uiTokenAmount.amount) - BigInt(destinationBefore?.uiTokenAmount.amount ?? '0') !== outputCredit) return result('unknown', 'The exact approved source and destination deltas cannot be verified.', { ...common, ...deltas });
      if (proof.outputUnitContext && destinationAfter!.uiTokenAmount.decimals !== proof.outputUnitContext.decimals) return result('unknown', 'The receipt decimals differ from the original display context.', { ...common, ...deltas });
    }
    if (BigInt(meta.fee) > BigInt(expected.maximumTotalSolCostLamports) || solDebit > BigInt(expected.maximumTotalSolCostLamports)) return result('unknown', 'The observed SOL debit exceeds the reviewed limit.', { ...common, ...deltas });
    const outputContext = proof?.outputUnitContext;
    const outputUnits = outputContext ? amountToUiAmountForScaledUiAmountMintWithoutSimulation(outputCredit, outputContext.decimals, outputContext.multiplier) : undefined;
    return result('confirmed', 'Solana confirmed the original transaction and its exact token deltas satisfy the reviewed purchase.', { ...common, ...deltas, metaError: null, rawTokenBalances: { before: meta.preTokenBalances, after: meta.postTokenBalances }, ...(proof ? { approvedLoadedAddresses: approvedLoaded, validatorVersion: proof.version, reviewedTokenFeeRaw: proof.tokenFeeRaw } : {}), ...(outputContext ? { outputUnitContext: outputContext, outputUnits } : {}) });
  } catch {
    return result('unknown', 'The returned transaction could not be matched to the approved signed message.');
  }
}

type TokenBalance = z.infer<typeof tokenBalanceSchema>;
function tokenBalances(rows: TokenBalance[], accountCount: number): Map<number, TokenBalance> | null {
  const result = new Map<number, TokenBalance>();
  for (const row of rows) {
    if (row.accountIndex >= accountCount || result.has(row.accountIndex) || ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(row.programId)) return null;
    result.set(row.accountIndex, row);
  }
  return result;
}
function sumOwned(rows: Map<number, TokenBalance>, wallet: string, mint: string, program: string, decimals?: number): bigint | null {
  let total = 0n;
  let observedDecimals = decimals;
  for (const row of rows.values()) {
    if (row.owner !== wallet || row.mint !== mint) continue;
    observedDecimals ??= row.uiTokenAmount.decimals;
    if (row.programId !== program || row.uiTokenAmount.decimals !== observedDecimals) return null;
    total += BigInt(row.uiTokenAmount.amount);
  }
  return total <= U64_MAX ? total : null;
}
