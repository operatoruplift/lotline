import 'server-only';
import { z } from 'zod';
import { XSTOCK_MINTS } from '../domain/assets';
import { ENRICHMENT_MAX_AGE_MS, type AssetDetails, type AssetDetailsResponse } from '../domain/enrichment';
import { selectedAssets } from './catalog';
import { addressSchema, BoundedCache, SpacedQueue } from './common';

const API_ORIGIN = 'https://api.tokens.xyz';
const MAX_BYTES = 256 * 1024;
const MAX_PENDING = 4;
const MAX_REQUESTS_PER_MINUTE = 20;
const FUTURE_TOLERANCE_MS = 60_000;
const allowedMints = new Set(XSTOCK_MINTS);
const queue = new SpacedQueue(1100, MAX_PENDING);
const cache = new BoundedCache<AssetDetailsResponse>(128);
const pending = new Map<string, Promise<AssetDetailsResponse>>();
let requestStarts: number[] = [];
let cooldownUntil = 0;

const optionalText = z.string().trim().min(1).max(200).nullable().optional();
const optionalTime = z.number().int().nonnegative().max(8_640_000_000_000_000).nullable().optional();
const variantSchema = z.object({
  mint: addressSchema,
  // The documented v1 contract is Solana-only and need not repeat its network.
  // If a future payload does specify one, never accept a contradictory chain.
  chain: z.literal('solana').optional(), network: z.literal('solana').optional(),
  name: optionalText, label: optionalText, kind: optionalText, issuer: optionalText,
  market: z.object({
    liquidity: z.number().finite().nonnegative().nullable().optional(),
    lastFetchedAt: optionalTime, asOf: optionalTime,
  }).nullable().optional(),
  advisory: z.object({ status: z.string().min(1).max(40), reason: z.string().min(1).max(500) }).nullable().optional(),
});
const payloadSchema = z.object({
  asset: z.object({
    assetId: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/),
    name: optionalText,
    chain: z.literal('solana').optional(), network: z.literal('solana').optional(),
    variantGroups: z.record(z.string().min(1).max(40), z.array(variantSchema).max(200))
      .refine(groups => Object.keys(groups).length <= 16 && Object.values(groups).reduce((count, rows) => count + rows.length, 0) <= 1000),
  }),
  resolution: z.object({ assetId: z.string().max(120).optional(), mint: addressSchema.nullable().optional() }).optional(),
});

function result(mint: string, state: AssetDetailsResponse['state'], message: string, details: AssetDetails | null = null): AssetDetailsResponse {
  return { state, network: 'solana', mint: mint.slice(0, 44), source: 'tokens.xyz', details, message };
}
function unavailable(mint: string) {
  return result(mint, 'unavailable', 'Optional asset context is unavailable. Your contribution plan still works.');
}
function validTime(time: number | null | undefined): time is number {
  return typeof time === 'number' && time > 0 && time <= Date.now() + FUTURE_TOLERANCE_MS;
}

/** Parses only exact-mint context. Canonical prices, aggregate liquidity and primary selection are deliberately ignored. */
export function parseTokensAssetDetails(payload: unknown, mint: string): AssetDetailsResponse {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return unavailable(mint);
  const { asset, resolution } = parsed.data;
  if (resolution?.mint && resolution.mint !== mint) return unavailable(mint);
  if (resolution?.assetId && resolution.assetId !== asset.assetId) return unavailable(mint);
  const matches = Object.values(asset.variantGroups).flat().filter(variant => variant.mint === mint);
  if (matches.length !== 1) return unavailable(mint);
  const variant = matches[0];
  const market = variant.market;
  const snapshotTime = market?.lastFetchedAt;
  const details: AssetDetails = {
    canonicalId: asset.assetId,
    ...(asset.name ? { canonicalName: asset.name } : {}),
    ...(variant.name || variant.label ? { representation: variant.name || variant.label! } : {}),
    ...(variant.kind ? { kind: variant.kind } : {}),
    ...(variant.issuer ? { issuer: variant.issuer } : {}),
    ...(validTime(snapshotTime) ? { snapshotFetchedAt: new Date(snapshotTime).toISOString() } : {}),
    ...(validTime(market?.asOf) ? { activityAsOf: new Date(market.asOf).toISOString() } : {}),
    sourceUrl: `https://tokens.xyz/${encodeURIComponent(asset.assetId)}?solana=${encodeURIComponent(mint)}`,
    ...(variant.advisory ? { advisory: variant.advisory } : {}),
  };
  if (validTime(snapshotTime) && Date.now() - snapshotTime >= ENRICHMENT_MAX_AGE_MS) {
    return result(mint, 'stale', 'Tokens’ provider snapshot is older than 15 minutes. Liquidity is omitted.', details);
  }
  if (!validTime(snapshotTime) || market?.liquidity == null) {
    return result(mint, 'partial', 'Canonical context is available, but recent dated mint liquidity is not.', details);
  }
  details.liquidityUsd = market.liquidity;
  return { state: 'success', network: 'solana', mint, source: 'tokens.xyz', details };
}

/** Recheck age when serving cached context; never replace provider timestamps with our clock. */
function current(response: AssetDetailsResponse): AssetDetailsResponse {
  const time = response.details?.snapshotFetchedAt;
  if (time && Date.now() - Date.parse(time) >= ENRICHMENT_MAX_AGE_MS) {
    const details = { ...response.details! };
    delete details.liquidityUsd;
    return result(response.mint, 'stale', 'Tokens’ provider snapshot is older than 15 minutes. Liquidity is omitted.', details);
  }
  return response;
}

class ContextError extends Error {
  constructor(readonly retryable = false) { super('Optional context unavailable'); }
}
function takeRequestSlot() {
  const now = Date.now();
  requestStarts = requestStarts.filter(start => now - start < 60_000);
  if (now < cooldownUntil || requestStarts.length >= MAX_REQUESTS_PER_MINUTE) throw new ContextError();
  requestStarts.push(now);
}
function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new ContextError()); return; }
    const onAbort = () => { clearTimeout(timer); reject(new ContextError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES || !response.body) {
    // Rejecting headers must also stop the network body. Otherwise clearing the
    // request deadline would leave a large or endless response downloading.
    await response.body?.cancel().catch(() => undefined);
    throw new ContextError();
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      if (signal.aborted) throw new ContextError();
      const next = await reader.read();
      if (signal.aborted) throw new ContextError();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new ContextError(); }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')) as unknown;
  } catch { throw new ContextError(); }
  finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

async function fetchContext(mint: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (controller.signal.aborted) throw new ContextError();
      takeRequestSlot();
      try {
        const response = await fetch(`${API_ORIGIN}/v1/assets/solana-${mint}?mint=${mint}`, {
          headers: { 'x-api-key': apiKey, Accept: 'application/json' },
          cache: 'no-store', redirect: 'error', signal: controller.signal,
        });
        if (response.status === 429) {
          const retrySeconds = Number(response.headers.get('retry-after'));
          // A per-key quota may last until next month. Do not immediately retry
          // a 429; suppress local traffic and let a later explicit action retry.
          cooldownUntil = Date.now() + (Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.min(60_000, Math.max(10_000, retrySeconds * 1000)) : 30_000);
          await response.body?.cancel();
          throw new ContextError();
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new ContextError(response.status >= 500);
        }
        return await boundedJson(response, controller.signal);
      } catch (error) {
        const retryable = error instanceof ContextError ? error.retryable : !controller.signal.aborted;
        if (attempt !== 0 || !retryable || controller.signal.aborted) throw new ContextError();
        await wait(400 + Math.floor(Math.random() * 150), controller.signal);
      }
    }
    throw new ContextError();
  } finally { controller.abort(); clearTimeout(timeout); }
}

async function verifiedAsset(mint: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Catalog work may be shared with a live planner. Bound this optional caller
    // without cancelling that independent shared verification operation.
    return await Promise.race([
      selectedAssets([mint]),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ContextError()), 5000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function getAssetDetails(network: string, mint: string): Promise<AssetDetailsResponse> {
  if (network !== 'solana' || !addressSchema.safeParse(mint).success || !allowedMints.has(mint)) {
    return result(mint, 'invalid-input', 'Choose a verified Solana xStock from the current catalog.');
  }
  const apiKey = process.env.TOKENS_XYZ_API_KEY?.trim();
  if (process.env.TOKENS_XYZ_ENABLED !== 'true' || !apiKey) {
    return result(mint, 'configuration-required', 'Optional Tokens.xyz context is not enabled. Your contribution plan still works.');
  }
  const key = `solana:${mint}`;
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= MAX_PENDING) return unavailable(mint);
  const operation = (async () => {
    try {
      // Reuse the issuer/on-chain verification boundary; Tokens cannot add a
      // supported mint or change the planner's identity, halt state or units.
      const verified = await verifiedAsset(mint);
      if (verified.length !== 1 || verified[0].mint !== mint) return unavailable(mint);
      const cached = cache.get(key);
      if (cached) return current(cached);
      const response = await queue.run(async () => parseTokensAssetDetails(await fetchContext(mint, apiKey), mint));
      cache.set(key, response, response.details ? 60_000 : 10_000);
      return response;
    } catch { return unavailable(mint); }
  })();
  pending.set(key, operation);
  try { return await operation; }
  finally { pending.delete(key); }
}
