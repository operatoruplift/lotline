import 'server-only';
import { address, getCompiledTransactionMessageDecoder, getTransactionDecoder, unwrapOption } from '@solana/kit';
import { findAssociatedTokenPda, getMintDecoder } from '@solana-program/token-2022';
import { z } from 'zod';
import type { Asset, UnitContext } from '@/lib/domain/types';
import type { ContributionIntent, ExecutionLimits } from '@/lib/domain/execution';
import { addressSchema, rawSchema, ServiceError, TOKEN_PROGRAM, TOKEN_2022_PROGRAM, USDC_MINT } from '@/lib/server/common';
import { convertRawUnitsWithContext, inspectMintTransferPolicy, rpcRequest } from '@/lib/server/solana';
import { MAINNET_GENESIS_HASH } from '@/lib/server/solana-network';
import { accountBytes, chainAccountSchema, readChainAccounts, resolveMessageAccounts, type ResolvedMessage } from './chain-accounts';
import { inspectRouteAccounts, inspectRouteInstructions, inspectTokenAccount, JUPITER_USDC_FEE_OWNERS, SEMANTIC_VALIDATOR_VERSION, SYSTEM_PROGRAM, type RouteProof } from './route-semantics';
import type { ExecutionOrder } from './orders';

export type SemanticProof = {
  version: typeof SEMANTIC_VALIDATOR_VERSION; genesisHash: string; lookupContextSlot: number | null;
  loadedAddresses: { writable: string[]; readonly: string[] };
  source: string; destination: string; pool: string; inputRaw: string; minimumOutputRaw: string; tokenFeeRaw: string;
  simulationSlot: number; unitsConsumed: number; networkFeeLamports: string; rentLamports: string; totalSolCostLamports: string;
  checkedAt: string; outputUnitContext?: UnitContext; issuerControlled: boolean;
};
const rpcRaw = z.union([rawSchema, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String)]);
const slotSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const tokenBalanceSchema = z.object({ accountIndex: z.number().int().nonnegative(), mint: addressSchema, owner: addressSchema, programId: addressSchema, uiTokenAmount: z.object({ amount: rawSchema, decimals: z.number().int().min(0).max(18) }) });
const simulationSchema = z.object({
  context: z.object({ slot: slotSchema }), value: z.object({
    err: z.null(), replacementBlockhash: z.null().optional(), fee: rpcRaw,
    unitsConsumed: slotSchema, loadedAddresses: z.object({ writable: z.array(addressSchema), readonly: z.array(addressSchema) }),
    preBalances: z.array(rpcRaw).max(100), postBalances: z.array(rpcRaw).max(100),
    preTokenBalances: z.array(tokenBalanceSchema).max(100), postTokenBalances: z.array(tokenBalanceSchema).max(100),
    accounts: z.array(chainAccountSchema.nullable()).length(3),
  }),
});
function fail(message: string): never { throw new ServiceError('unavailable', message); }

/** All deltas come from the same simulation bank, never separately fetched balances. */
export function inspectSimulation(payload: unknown, resolved: ResolvedMessage, route: RouteProof, order: ExecutionOrder, wallet: string, outputDecimals: number, networkFee: string, minimumSlot: number) {
  const parsed = simulationSchema.safeParse(payload);
  if (!parsed.success) fail('The original transaction did not simulate successfully with complete balance evidence. No wallet approval was requested.');
  const { context, value } = parsed.data;
  if (context.slot < minimumSlot || value.unitsConsumed > route.computeUnits || value.fee !== networkFee || JSON.stringify(value.loadedAddresses.writable) !== JSON.stringify(resolved.loadedAddresses.writable) || JSON.stringify(value.loadedAddresses.readonly) !== JSON.stringify(resolved.loadedAddresses.readonly)) fail('Simulation context, loaded addresses or compute fees differ from the reviewed transaction.');
  const count = resolved.accounts.length;
  if (value.preBalances.length !== count || value.postBalances.length !== count) fail('Simulation SOL balance evidence is incomplete.');
  const indexOf = (key: string) => resolved.accounts.findIndex(account => account.address === key);
  const sourceIndex = indexOf(route.source); const destinationIndex = indexOf(route.destination);
  const a = route.routeAccountAddresses;
  const expected = [
    { index: sourceIndex, mint: USDC_MINT, owner: wallet, program: TOKEN_PROGRAM, decimals: 6, delta: -BigInt(order.inAmount) },
    { index: destinationIndex, mint: order.outputMint, owner: wallet, program: TOKEN_2022_PROGRAM, decimals: outputDecimals },
    { index: indexOf(a[10]), mint: USDC_MINT, owner: JUPITER_USDC_FEE_OWNERS[a[10]], program: TOKEN_PROGRAM, decimals: 6, delta: BigInt(route.tokenFeeRaw) },
    { index: indexOf(a[17]), mint: USDC_MINT, owner: route.pool, program: TOKEN_PROGRAM, decimals: 6, delta: BigInt(order.inAmount) - BigInt(route.tokenFeeRaw) },
    { index: indexOf(a[18]), mint: order.outputMint, owner: route.pool, program: TOKEN_2022_PROGRAM, decimals: outputDecimals },
  ];
  for (const entries of [value.preTokenBalances, value.postTokenBalances]) {
    if (new Set(entries.map(item => item.accountIndex)).size !== entries.length || entries.some(item => !expected.some(allowed => allowed.index === item.accountIndex))) fail('Simulation contains unexpected token balance accounts.');
  }
  const deltas = expected.map(identity => {
    const pre = value.preTokenBalances.find(item => item.accountIndex === identity.index);
    const post = value.postTokenBalances.find(item => item.accountIndex === identity.index);
    if (!post || (!pre && !(route.createsDestination && identity.index === destinationIndex && value.preBalances[destinationIndex] === '0'))) fail('Simulation token balance evidence is incomplete.');
    for (const entry of [pre, post]) if (entry && (entry.mint !== identity.mint || entry.owner !== identity.owner || entry.programId !== identity.program || entry.uiTokenAmount.decimals !== identity.decimals)) fail('Simulation token identity differs from the reviewed account.');
    const delta = BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount.amount ?? '0');
    if (identity.delta !== undefined && delta !== identity.delta) fail('The simulated USDC spend or fee exceeds the encoded exact-input policy.');
    return delta;
  });
  if (deltas[1] < BigInt(route.encodedMinimumOutputRaw) || deltas[4] !== -deltas[1]) fail('Simulation does not deliver the enforced minimum output to the reviewed wallet.');
  const rent = BigInt(value.postBalances[destinationIndex]) - BigInt(value.preBalances[destinationIndex]);
  if (rent < 0n || (!route.createsDestination && rent !== 0n) || rent.toString() !== order.rentFeeLamports) fail('The simulated account-creation cost differs from the reviewed rent.');
  const total = BigInt(networkFee) + rent;
  for (let index = 0; index < count; index++) {
    const delta = BigInt(value.postBalances[index]) - BigInt(value.preBalances[index]);
    if (delta !== (index === 0 ? -total : index === destinationIndex ? rent : 0n)) fail('Simulation contains an unexpected SOL transfer, account closure or rent refund.');
  }
  if (total.toString() !== order.totalSolCostLamports) fail('The simulated total SOL cost differs from the review.');
  const [walletAccount, sourceAccount, destinationAccount] = value.accounts;
  if (!walletAccount || walletAccount.owner !== SYSTEM_PROGRAM || walletAccount.executable || accountBytes(walletAccount).length || walletAccount.lamports !== value.postBalances[0] || !sourceAccount || !destinationAccount) fail('Simulation returned an unsupported wallet or token-account state.');
  const source = inspectTokenAccount(sourceAccount, { mint: USDC_MINT, owner: wallet, program: TOKEN_PROGRAM });
  const destination = inspectTokenAccount(destinationAccount, { mint: order.outputMint, owner: wallet, program: TOKEN_2022_PROGRAM });
  if (source.amount.toString() !== value.postTokenBalances.find(item => item.accountIndex === sourceIndex)?.uiTokenAmount.amount || destination.amount.toString() !== value.postTokenBalances.find(item => item.accountIndex === destinationIndex)?.uiTokenAmount.amount) fail('Simulation account bytes disagree with its token balance evidence.');
  return { slot: context.slot, unitsConsumed: value.unitsConsumed, rentLamports: rent.toString(), totalSolCostLamports: total.toString() };
}

/** Narrow, versioned semantic policy. Any unrecognized route or RPC evidence stays closed. */
export async function validateExecutableOrder(order: ExecutionOrder, intent: ContributionIntent, asset: Asset, limits: ExecutionLimits): Promise<ExecutionOrder> {
  const genesis = await rpcRequest('getGenesisHash', []);
  if (genesis !== MAINNET_GENESIS_HASH) fail('The execution RPC is not Solana mainnet.');
  const transaction = getTransactionDecoder().decode(Buffer.from(order.transaction, 'base64'));
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (message.version !== 0) fail('Only Solana v0 execution is supported.');
  const resolved = await resolveMessageAccounts(message);
  const route = inspectRouteInstructions(message, resolved, order, intent.wallet);
  const snapshot = await readChainAccounts(resolved.accounts.map(item => item.address), resolved.lookupContextSlot ?? undefined);
  const byAddress = new Map(resolved.accounts.map((account, index) => [account.address, snapshot.accounts[index]]));
  const identities = inspectRouteAccounts(route, byAddress, asset.mint, intent.wallet);
  if (resolved.accounts.some(item => item.writable && !identities.allowedWritable.has(item.address))) fail('The transaction contains unexpected writable accounts.');
  const wallet = byAddress.get(intent.wallet);
  if (!wallet || wallet.owner !== SYSTEM_PROGRAM || wallet.executable || accountBytes(wallet).length || BigInt(wallet.lamports) < BigInt(order.totalSolCostLamports) || identities.source.amount < BigInt(order.inAmount)) fail('The wallet has insufficient funds or an unsupported account state.');
  for (const instruction of message.instructions) if (!byAddress.get(resolved.accounts[instruction.programAddressIndex].address)?.executable) fail('A transaction program account is not executable.');
  let issuerControlled = false;
  for (const mintAddress of [USDC_MINT, asset.mint]) {
    const account = byAddress.get(mintAddress);
    if (!account || account.executable || account.owner !== (mintAddress === USDC_MINT ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM)) fail('The reviewed mint program could not be verified.');
    const mint = getMintDecoder().decode(accountBytes(account));
    const policy = inspectMintTransferPolicy(mint);
    if (!mint.isInitialized || mint.decimals !== (mintAddress === USDC_MINT ? 6 : asset.decimals) || policy.transferBlockedReasons?.length) fail('This mint has unsupported or currently blocked transfer behavior.');
    if (mintAddress === asset.mint) {
      if (!(unwrapOption(mint.extensions) ?? []).some(extension => extension.__kind === 'ScaledUiAmountConfig')) fail('The output mint is not the reviewed scaled xStock.');
      issuerControlled = Boolean(policy.issuerControlled);
    }
  }
  if (route.createsDestination) {
    const [ata] = await findAssociatedTokenPda({ owner: address(intent.wallet), mint: address(asset.mint), tokenProgram: address(TOKEN_2022_PROGRAM) });
    if (String(ata) !== route.destination) fail('The created token account is not the wallet’s associated output account.');
  }
  const feeResult = z.object({ context: z.object({ slot: slotSchema }), value: rpcRaw }).safeParse(await rpcRequest('getFeeForMessage', [Buffer.from(transaction.messageBytes).toString('base64'), { commitment: 'confirmed' }]));
  if (!feeResult.success || feeResult.data.value !== (BigInt(order.signatureFeeLamports) + BigInt(route.priorityFeeLamports)).toString() || BigInt(order.totalSolCostLamports) > BigInt(limits.maximumTotalSolCostLamports) || BigInt(route.priorityFeeLamports) > BigInt(limits.maximumPriorityFeeLamports) || order.feeBps > limits.maximumTokenFeeBps || order.slippageBps > limits.slippageBps) fail('The original transaction fee cannot be verified within the reviewed limits.');
  const minimumSlot = Number(snapshot.slot);
  const simulation = inspectSimulation(await rpcRequest('simulateTransaction', [order.transaction, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed', minContextSlot: minimumSlot, accounts: { encoding: 'base64', addresses: [intent.wallet, route.source, route.destination] } }]), resolved, route, order, intent.wallet, asset.decimals, feeResult.data.value, minimumSlot);
  const units = await convertRawUnitsWithContext(asset.mint, order.minimumOutputRaw);
  const valid = z.object({ value: z.boolean() }).safeParse(await rpcRequest('isBlockhashValid', [order.originalBlockhash, { commitment: 'confirmed', minContextSlot: simulation.slot }]));
  const height = rpcRaw.safeParse(await rpcRequest('getBlockHeight', [{ commitment: 'confirmed', minContextSlot: simulation.slot }]));
  if (!valid.success || !valid.data.value || !height.success || !order.lastValidBlockHeight || BigInt(height.data) > BigInt(order.lastValidBlockHeight) || Date.parse(order.expiresAt) <= Date.now()) fail('The original order expired during verification. Refresh the review; no replacement blockhash was used.');
  const proof: SemanticProof = { version: SEMANTIC_VALIDATOR_VERSION, genesisHash: MAINNET_GENESIS_HASH, lookupContextSlot: resolved.lookupContextSlot === null ? null : Number(resolved.lookupContextSlot), loadedAddresses: resolved.loadedAddresses, source: route.source, destination: route.destination, pool: route.pool, inputRaw: route.encodedInputRaw, minimumOutputRaw: route.encodedMinimumOutputRaw, tokenFeeRaw: route.tokenFeeRaw, simulationSlot: simulation.slot, unitsConsumed: simulation.unitsConsumed, networkFeeLamports: feeResult.data.value, rentLamports: simulation.rentLamports, totalSolCostLamports: simulation.totalSolCostLamports, checkedAt: new Date().toISOString(), outputUnitContext: units.context, issuerControlled };
  return { ...order, validation: SEMANTIC_VALIDATOR_VERSION, semanticProof: proof, platformFee: { feeBps: order.feeBps, feeMint: USDC_MINT, amount: route.tokenFeeRaw } };
}
