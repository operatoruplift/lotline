import 'server-only';
import { getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';
import { z } from 'zod';
import { addressSchema, rawSchema, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, U64_MAX, USDC_MINT } from '@/lib/server/common';
import { validateSignedTransaction } from './submit';

export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
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

export type ReceiptExpectation = {
  wallet: string; signature: string; messageHash: string; transaction: string;
  originalBlockhash: string; inputMint: string; outputMint: string;
  maximumInputRaw: string; minimumOutputRaw: string; maximumTotalSolCostLamports: string;
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
    if (message.version !== 0 || message.addressTableLookups?.length) return result('unknown', 'This receipt requires unsupported address lookup resolution.');
    const meta = transaction.meta;
    if ((meta.loadedAddresses?.writable.length ?? 0) !== 0 || (meta.loadedAddresses?.readonly.length ?? 0) !== 0 || meta.preBalances.length !== message.staticAccounts.length || meta.postBalances.length !== message.staticAccounts.length) return result('unknown', 'The transaction account and balance records are incomplete.');
    const common = { signature: expected.signature, transactionMessageHash: expected.messageHash, signedTransactionHash: signed.signedTransactionHash, originalBlockhash: expected.originalBlockhash, genesisHash: MAINNET_GENESIS_HASH, confirmationStatus: receipt.confirmationStatus, slot: transaction.slot, feeLamports: meta.fee, blockTime: transaction.blockTime ?? null, proofAt: new Date().toISOString() };
    if ((receipt.err === null) !== (meta.err === null)) return result('unknown', 'The signature and transaction records disagree about an on-chain error.', common);
    if (meta.err !== null) return result('failed-onchain', 'The original Solana transaction failed on-chain. No replacement purchase was created.', { ...common, metaError: meta.err });
    if (expected.inputMint !== USDC_MINT || !rawSchema.safeParse(expected.maximumInputRaw).success || !rawSchema.safeParse(expected.minimumOutputRaw).success || !rawSchema.safeParse(expected.maximumTotalSolCostLamports).success) return result('unknown', 'The preserved contribution limits cannot be verified.');
    const accountCount = message.staticAccounts.length;
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
    if (BigInt(meta.fee) > BigInt(expected.maximumTotalSolCostLamports) || solDebit > BigInt(expected.maximumTotalSolCostLamports)) return result('unknown', 'The observed SOL debit exceeds the reviewed limit.', { ...common, ...deltas });
    return result('confirmed', 'Solana confirmed the original transaction and its exact token deltas satisfy the reviewed purchase.', { ...common, ...deltas, metaError: null, rawTokenBalances: { before: meta.preTokenBalances, after: meta.postTokenBalances } });
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
