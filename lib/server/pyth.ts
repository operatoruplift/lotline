import 'server-only';
import { z } from 'zod';
import { XSTOCK_REGISTRY } from '../domain/assets';
import { MARKET_REFERENCE_MAX_MINTS, PYTH_MAX_AGE_SECONDS, isPythObservationFresh, pythConfidenceBps, pythDecimal, type MarketReferenceItem, type MarketReferenceResponse, type PythObservation } from '../domain/market-reference';
import { addressSchema, BoundedCache, ServiceError, SpacedQueue } from './common';

// Verified against official Hermes metadata; see the dated public discovery evidence.
// No symbol guessing, user-provided feed IDs, or cross-chain token-price equivalence.
export const PYTH_FEEDS = [
  { mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', symbol: 'AAPL', underlying: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688', token: '978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675' },
  { mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', symbol: 'MSFT', underlying: 'd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1', token: 'bb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5' },
  { mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', symbol: 'NVDA', underlying: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593', token: '4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f' },
] as const;
const HERMES = 'https://pyth.dourolabs.app/hermes/v2/updates/price/latest';
const MAX_BYTES = 256 * 1024;
const MAX_PENDING = 4;
const queue = new SpacedQueue(1100, MAX_PENDING);
const cache = new BoundedCache<MarketReferenceResponse>(32);
const pending = new Map<string, Promise<MarketReferenceResponse>>();
const knownMints = new Set(XSTOCK_REGISTRY.map(asset => asset.mint));
let starts: number[] = [];
let cooldownUntil = 0;
const caveat = 'Separate USD references. The token feed unit basis is unverified; no token premium or Jupiter execution-price comparison is calculated.';

export const marketReferenceRequestSchema = z.object({
  mints: z.array(addressSchema).min(1).max(MARKET_REFERENCE_MAX_MINTS).refine(mints => new Set(mints).size === mints.length),
}).strict();
const priceSchema = z.object({
  price: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n),
  conf: z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
  expo: z.number().int().min(-12).max(12),
  publish_time: z.number().int().min(1).max(4_102_444_800),
}).refine(value => /^(0|[1-9][0-9]{0,19})$/.test(value.conf) && /^[1-9][0-9]{0,18}$/.test(value.price) && BigInt(value.conf) < BigInt(value.price));
const upstreamSchema = z.object({ parsed: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), price: priceSchema })).max(20) });

export function emptyMarketReference(mints: string[], state: MarketReferenceResponse['state'], message: string): MarketReferenceResponse {
  const fetchedAt = new Date().toISOString();
  return { source: 'pyth', state, fetchedAt, expiresAt: fetchedAt, items: mints.map(mint => ({ mint, state, comparison: 'not-comparable', message })), message };
}
function summarize(items: MarketReferenceItem[]): MarketReferenceResponse['state'] {
  if (items.every(item => item.state === 'success')) return 'success';
  if (items.some(item => item.underlying?.state === 'fresh' || item.token?.state === 'fresh')) return 'partial';
  return items.some(item => item.underlying || item.token) ? 'stale' : 'unavailable';
}
function itemState(underlying?: PythObservation, token?: PythObservation): MarketReferenceItem['state'] {
  if (underlying?.state === 'fresh' && token?.state === 'fresh') return 'success';
  if (underlying?.state === 'fresh' || token?.state === 'fresh') return 'partial';
  return underlying || token ? 'stale' : 'unavailable';
}

/** Validates the complete bounded response before exposing any price. Missing feeds remain unavailable. */
export function parsePythReferences(payload: unknown, mints: string[], fetchedAt: string, now = Date.now()): MarketReferenceResponse {
  const expected = PYTH_FEEDS.filter(feed => mints.includes(feed.mint));
  const ids = new Set<string>(expected.flatMap(feed => [feed.underlying, feed.token]));
  const parsed = upstreamSchema.safeParse(payload);
  if (!Number.isFinite(Date.parse(fetchedAt)) || !parsed.success || new Set(parsed.data.parsed.map(feed => feed.id)).size !== parsed.data.parsed.length
    || parsed.data.parsed.some(feed => !ids.has(feed.id) || feed.price.publish_time > Math.floor(now / 1000))) {
    throw new ServiceError('unavailable', 'Pyth returned an unverified price response.');
  }
  const observations = new Map(parsed.data.parsed.map(feed => [feed.id, feed.price]));
  const observation = (id: string, symbol: string, kind: PythObservation['kind']): PythObservation | undefined => {
    const value = observations.get(id);
    if (!value) return;
    const expiresAt = new Date((value.publish_time + PYTH_MAX_AGE_SECONDS) * 1000).toISOString();
    return { feedId: id, symbol, kind, quoteCurrency: 'USD', unitBasis: kind === 'underlying' ? 'underlying-share' : 'unverified-token-unit', price: value.price, confidence: value.conf, exponent: value.expo, publishTime: value.publish_time, publishedAt: new Date(value.publish_time * 1000).toISOString(), fetchedAt, expiresAt, state: now < Date.parse(expiresAt) ? 'fresh' : 'stale', displayPrice: pythDecimal(value.price, value.expo), displayConfidence: pythDecimal(value.conf, value.expo), confidenceBps: pythConfidenceBps(value.price, value.conf) };
  };
  const items: MarketReferenceItem[] = mints.map(mint => {
    const mapping = expected.find(feed => feed.mint === mint);
    if (!mapping) return { mint, state: 'unavailable', comparison: 'not-comparable', message: 'No verified Pyth feed mapping is available for this asset.' };
    const underlying = observation(mapping.underlying, `Equity.US.${mapping.symbol}/USD`, 'underlying');
    const token = observation(mapping.token, `Crypto.${mapping.symbol}X/USD`, 'token');
    return { mint, state: itemState(underlying, token), comparison: 'not-comparable', ...(underlying ? { underlying } : {}), ...(token ? { token } : {}), message: underlying || token ? caveat : 'Pyth did not return these price feeds.' };
  });
  const expiries = items.flatMap(item => [item.underlying, item.token].filter(value => value !== undefined).map(value => Date.parse(value.expiresAt)));
  return { source: 'pyth', state: summarize(items), fetchedAt, expiresAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : fetchedAt, items, message: caveat };
}

function current(response: MarketReferenceResponse): MarketReferenceResponse {
  if (!response.items.some(item => item.underlying || item.token)) return response;
  const items = response.items.map(item => {
    const refresh = (value: PythObservation | undefined): PythObservation | undefined => value && { ...value, state: isPythObservationFresh(value) ? 'fresh' : 'stale' };
    const underlying = refresh(item.underlying);
    const token = refresh(item.token);
    return { ...item, ...(underlying ? { underlying } : {}), ...(token ? { token } : {}), state: itemState(underlying, token) };
  });
  return { ...response, items, state: summarize(items) };
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES || !response.body) {
    await response.body?.cancel();
    throw new ServiceError('unavailable', 'Pyth returned an unsupported response.');
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error();
      const { value, done } = await reader.read();
      if (signal.aborted) throw new Error();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown;
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

async function fetchReferences(mints: string[], apiKey: string): Promise<MarketReferenceResponse> {
  return queue.run(async () => {
    const now = Date.now();
    starts = starts.filter(start => now - start < 60_000);
    if (now < cooldownUntil || starts.length >= 20) throw new ServiceError('unavailable', 'Pyth reference requests are busy. Try again in a minute.');
    starts.push(now);
    const url = new URL(HERMES);
    for (const feed of PYTH_FEEDS.filter(feed => mints.includes(feed.mint))) for (const id of [feed.underlying, feed.token]) url.searchParams.append('ids[]', id);
    url.searchParams.set('parsed', 'true');
    const fetchedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw new ServiceError('configuration-required', 'Pyth price access is not configured. Your Jupiter estimates remain available.');
        if (response.status === 429) { cooldownUntil = Date.now() + 60_000; throw new ServiceError('unavailable', 'Pyth rate limit reached. Try again in a minute.'); }
        throw new ServiceError('unavailable', 'Pyth price references are temporarily unavailable.');
      }
      return parsePythReferences(await readBoundedJson(response, controller.signal), mints, fetchedAt);
    } finally { clearTimeout(timer); }
  });
}

export async function getMarketReferences(mints: string[]): Promise<MarketReferenceResponse> {
  if (!marketReferenceRequestSchema.safeParse({ mints }).success || mints.some(mint => !knownMints.has(mint))) return emptyMarketReference([], 'invalid-input', 'Choose up to ten unique xStocks from the verified catalog.');
  if (!mints.some(mint => PYTH_FEEDS.some(feed => feed.mint === mint))) return emptyMarketReference(mints, 'unavailable', 'No verified Pyth feed mapping is available for these assets.');
  const apiKey = process.env.PYTH_API_KEY?.trim();
  if (!apiKey) return emptyMarketReference(mints, 'configuration-required', 'Pyth price access is not configured. Your Jupiter estimates remain available.');
  const ordered = [...mints].sort();
  const key = ordered.join(',');
  const existing = cache.get(key);
  if (existing) return current(existing);
  let promise = pending.get(key);
  if (!promise) {
    if (pending.size >= MAX_PENDING) return emptyMarketReference(mints, 'unavailable', 'Pyth reference requests are busy. Try again in a minute.');
    promise = fetchReferences(ordered, apiKey).catch(error => emptyMarketReference(ordered, error instanceof ServiceError ? error.kind : 'unavailable', error instanceof ServiceError ? error.message : 'Pyth price references could not be reached or verified.')).then(result => { cache.set(key, result, 5000); return result; }).finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}
