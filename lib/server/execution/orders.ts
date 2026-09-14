import 'server-only';
import { createHash } from 'node:crypto';
import { getCompiledTransactionMessageDecoder, getTransactionDecoder, getTransactionSize } from '@solana/kit';
import type { Transaction } from '@solana/transactions';
import type { CompiledTransactionMessage } from '@solana/transaction-messages';
import type { Address } from '@solana/addresses';
import { z } from 'zod';
import type { Asset } from '@/lib/domain/types';
import type { ContributionIntent, ExecutionLimits } from '@/lib/domain/execution';
import { addressSchema, fetchJson, isBoundedRaw, rawSchema, ServiceError, USDC_MINT } from '@/lib/server/common';
import { reserveProviderSlot } from '@/lib/server/provider-limits';

const MAX_TRANSACTION_BASE64 = 1_700_000;
const supportedRouters = new Set(['iris', 'metis']);
const orderSchema = z.object({
  requestId: z.string().min(1).max(160),
  transaction: z.string().min(1).max(MAX_TRANSACTION_BASE64),
  inputMint: addressSchema,
  outputMint: addressSchema,
  inAmount: rawSchema,
  outAmount: rawSchema,
  otherAmountThreshold: rawSchema,
  router: z.string().min(1).max(32),
  lastValidBlockHeight: rawSchema.optional(),
  expireAt: z.string().datetime({ offset: true }).optional(),
  prioritizationFeeLamports: rawSchema.optional(),
  platformFee: z.object({ amount: rawSchema, feeBps: z.number().int().min(0).max(10_000), feeMint: addressSchema }).optional(),
}).passthrough();

export type ExecutionOrder = {
  requestId: string;
  transaction: string;
  messageHash: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  minimumOutputRaw: string;
  router: string;
  originalBlockhash: string;
  lastValidBlockHeight?: string;
  expiresAt: string;
  prioritizationFeeLamports: string;
  platformFee?: { amount: string; feeBps: number; feeMint: string };
  validation: 'v0-payer-and-lifetime-checked';
};

function assertBase64(value: string): Uint8Array {
  if (value.length > MAX_TRANSACTION_BASE64 || value.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new ServiceError('unavailable', 'Jupiter returned an invalid transaction. No wallet approval was requested.');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) throw new ServiceError('unavailable', 'Jupiter returned an invalid transaction. No wallet approval was requested.');
  return new Uint8Array(bytes);
}

function parseOrder(payload: unknown, intent: ContributionIntent, asset: Asset, limits: ExecutionLimits, fetchedAt: string): ExecutionOrder {
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError('unavailable', 'Jupiter returned an unsupported order. No wallet approval was requested.');
  const order = parsed.data;
  if (order.inputMint !== USDC_MINT || order.outputMint !== asset.mint || order.inAmount !== intent.legs.find(leg => leg.mint === asset.mint)?.maximumInputRaw) throw new ServiceError('unavailable', 'The executable order does not match this reviewed contribution. Refresh the review.');
  if (!supportedRouters.has(order.router)) throw new ServiceError('unavailable', 'This route uses a router Lotline cannot validate yet. Choose a different asset or review it on Jupiter.');
  if (BigInt(order.outAmount) <= 0n || BigInt(order.otherAmountThreshold) <= 0n || BigInt(order.otherAmountThreshold) > BigInt(order.outAmount)) throw new ServiceError('unavailable', 'The executable order has no enforceable positive minimum output.');
  if (order.platformFee && order.platformFee.feeBps > limits.maximumTokenFeeBps) throw new ServiceError('unavailable', 'The quoted token fee is above this review policy. Refresh with a smaller fee or choose another route.');
  if (order.prioritizationFeeLamports && BigInt(order.prioritizationFeeLamports) > BigInt(limits.maximumPriorityFeeLamports)) throw new ServiceError('unavailable', 'The quoted priority fee is above this review policy.');
  if (order.prioritizationFeeLamports && BigInt(order.prioritizationFeeLamports) > BigInt(limits.maximumTotalSolCostLamports)) throw new ServiceError('unavailable', 'The quoted SOL cost is above this review policy.');
  const bytes = assertBase64(order.transaction);
  let transaction: Transaction;
  try { transaction = getTransactionDecoder().decode(bytes) as typeof transaction; }
  catch { throw new ServiceError('unavailable', 'Jupiter returned a transaction Lotline cannot decode safely. No wallet approval was requested.'); }
  if (getTransactionSize(transaction) > 1232) throw new ServiceError('unavailable', 'The executable transaction exceeds Solana’s size limit.');
  let message: CompiledTransactionMessage & { lifetimeToken: string };
  try { message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes) as typeof message; }
  catch { throw new ServiceError('unavailable', 'The executable transaction message could not be decoded safely.'); }
  const walletSignature = transaction.signatures[intent.wallet as Address];
  const unsupportedSigner = Object.entries(transaction.signatures).some(([signer, signature]) => signer !== intent.wallet && signature === null);
  const staticAccounts = message.staticAccounts as readonly string[];
  const accountSet = new Set(staticAccounts);
  const v0Message = message as Extract<CompiledTransactionMessage, { version: 0 }> & { lifetimeToken: string };
  const instructionsValid = message.version === 0 && v0Message.instructions.every(instruction => instruction.programAddressIndex < staticAccounts.length && (instruction.accountIndices ?? []).every(index => index < staticAccounts.length));
  if (message.version !== 0 || staticAccounts[0] !== intent.wallet || walletSignature === undefined || walletSignature !== null || unsupportedSigner || !accountSet.has(USDC_MINT) || !accountSet.has(asset.mint) || !instructionsValid) throw new ServiceError('unavailable', 'The order payer, mint accounts, or transaction layout does not match the reviewed contribution.');
  const originalBlockhash = String(message.lifetimeToken);
  if (!originalBlockhash || originalBlockhash.length > 64) throw new ServiceError('unavailable', 'The executable order has no valid transaction lifetime.');
  const expiry = order.expireAt ? Date.parse(order.expireAt) : Date.parse(fetchedAt) + 30_000;
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.parse(fetchedAt) + 30_000) throw new ServiceError('unavailable', 'The executable order is already stale. Refresh the review.');
  return {
    requestId: order.requestId,
    transaction: order.transaction,
    messageHash: createHash('sha256').update(transaction.messageBytes as unknown as Uint8Array).digest('hex'),
    inputMint: order.inputMint,
    outputMint: order.outputMint,
    inAmount: order.inAmount,
    outAmount: order.outAmount,
    minimumOutputRaw: order.otherAmountThreshold,
    router: order.router,
    originalBlockhash,
    ...(order.lastValidBlockHeight ? { lastValidBlockHeight: order.lastValidBlockHeight } : {}),
    expiresAt: new Date(expiry).toISOString(),
    prioritizationFeeLamports: order.prioritizationFeeLamports ?? '0',
    ...(order.platformFee ? { platformFee: order.platformFee } : {}),
    validation: 'v0-payer-and-lifetime-checked',
  };
}

export async function createExecutionOrder(intent: ContributionIntent, asset: Asset, limits: ExecutionLimits): Promise<ExecutionOrder> {
  const leg = intent.legs.find(item => item.mint === asset.mint);
  if (!leg || !isBoundedRaw(leg.maximumInputRaw)) throw new ServiceError('invalid-input', 'The selected execution leg has an invalid amount.');
  const params = new URLSearchParams({ inputMint: USDC_MINT, outputMint: asset.mint, amount: leg.maximumInputRaw, taker: intent.wallet, slippageBps: String(limits.slippageBps), excludeRouters: 'jupiterz' });
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey) throw new ServiceError('configuration-required', 'Executable orders need a server-side Jupiter API key.');
  const fetchedAt = new Date().toISOString();
  await reserveProviderSlot('jupiter');
  const payload = await fetchJson(`https://api.jup.ag/swap/v2/order?${params}`, { headers: { 'x-api-key': apiKey } });
  return parseOrder(payload, intent, asset, limits, fetchedAt);
}

export { parseOrder };
