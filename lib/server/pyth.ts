import 'server-only';
import { z } from 'zod';
import { XSTOCK_REGISTRY } from '../domain/assets';
import { MARKET_REFERENCE_MAX_MINTS, PYTH_FEED_MAPPINGS, PYTH_USDC_FEED_ID, PYTH_USDC_LAZER_ID, buildPythObservation, isPythObservationFresh, pythRatio, type MarketReferenceItem, type MarketReferenceResponse, type PythObservation } from '../domain/market-reference';
import { addressSchema, BoundedCache, ServiceError, SpacedQueue } from './common';
import { priceDivergenceBps, readOnchainEquityObservation, readOnchainUsdcObservation, USDC_CROSS_CHECK_MAX_BPS } from './pyth-onchain';
import { readLazerFeeds, type LazerRead } from './pyth-lazer';

// Verified against official Hermes metadata; see the dated public discovery evidence.
// No symbol guessing, user-provided feed IDs, or cross-chain token-price equivalence.
export const PYTH_FEEDS = PYTH_FEED_MAPPINGS;
/** Every Hermes host has required a Pyth API key since 2026-08-26; the public host and the Douro mirror share routes and shapes. */
export const HERMES_DEFAULT_HOST = 'https://hermes.pyth.network';
const HERMES_LATEST_PATH = '/v2/updates/price/latest';
const MAX_BYTES = 256 * 1024;
const MAX_PENDING = 4;
const queue = new SpacedQueue(1100, MAX_PENDING);
const cache = new BoundedCache<MarketReferenceResponse>(32);
const pending = new Map<string, Promise<MarketReferenceResponse>>();
const knownMints = new Set(XSTOCK_REGISTRY.map(asset => asset.mint));
let starts: number[] = [];
let cooldownUntil = 0;
const caveat = 'Separate USD references. The cross-feed ratio is context only; the token feed unit basis is not verified against an underlying share.';
const keylessScope = 'Read without a key: Pyth Lazer serves the equity, token and USDC/USD feeds, and each equity and USDC reading is cross-checked against the Pyth receiver accounts on Solana mainnet.';
const chainScope = 'Read without a key from the Pyth receiver accounts on Solana mainnet: equity and USDC/USD references. Token references arrive when Pyth Lazer answers.';

type HermesEndpoint = { url: string; explicit: boolean } | { url: null; explicit: true };
/** Public host by default; an operator override must be https and is used as an origin only. */
function hermesEndpoint(): HermesEndpoint {
  const override = process.env.PYTH_HERMES_URL?.trim();
  if (!override) return { url: `${HERMES_DEFAULT_HOST}${HERMES_LATEST_PATH}`, explicit: false };
  try {
    const parsed = new URL(override);
    if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error();
    return { url: `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}${HERMES_LATEST_PATH}`, explicit: true };
  } catch { return { url: null, explicit: true }; }
}

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
/** A currency observation counts as availability; it never makes an asset item 'success'. */
function summarize(items: MarketReferenceItem[], usdc?: PythObservation): MarketReferenceResponse['state'] {
  if (items.every(item => item.state === 'success')) return 'success';
  if (items.some(item => item.underlying?.state === 'fresh' || item.token?.state === 'fresh') || usdc?.state === 'fresh') return 'partial';
  return items.some(item => item.underlying || item.token) || usdc ? 'stale' : 'unavailable';
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
  if (expected.length) ids.add(PYTH_USDC_FEED_ID);
  const parsed = upstreamSchema.safeParse(payload);
  if (!Number.isFinite(Date.parse(fetchedAt)) || !parsed.success || new Set(parsed.data.parsed.map(feed => feed.id)).size !== parsed.data.parsed.length
    || parsed.data.parsed.some(feed => !ids.has(feed.id) || feed.price.publish_time > Math.floor(now / 1000))) {
    throw new ServiceError('unavailable', 'Pyth returned an unverified price response.');
  }
  const observations = new Map(parsed.data.parsed.map(feed => [feed.id, feed.price]));
  const observation = (id: string, symbol: string, kind: PythObservation['kind']): PythObservation | undefined => {
    const value = observations.get(id);
    if (!value) return;
    return buildPythObservation({ feedId: id, symbol, kind, price: value.price, confidence: value.conf, exponent: value.expo, publishTime: value.publish_time, fetchedAt, provenance: 'hermes' }, now);
  };
  return assembleReferences(observation, mints, fetchedAt, caveat);
}

type ObservationLookup = (id: string, symbol: string, kind: PythObservation['kind']) => PythObservation | undefined;
/** One assembly for every source: the same item shape, states and expiry arithmetic. */
function assembleReferences(observation: ObservationLookup, mints: string[], fetchedAt: string, message: string, absent = 'Pyth did not return these price feeds.'): MarketReferenceResponse {
  const expected = PYTH_FEEDS.filter(feed => mints.includes(feed.mint));
  const items: MarketReferenceItem[] = mints.map(mint => {
    const mapping = expected.find(feed => feed.mint === mint);
    if (!mapping) return { mint, state: 'unavailable', comparison: 'not-comparable', message: 'No verified Pyth feed mapping is available for this asset.' };
    const underlying = observation(mapping.underlying, `Equity.US.${mapping.symbol}/USD`, 'underlying');
    const token = observation(mapping.token, `Crypto.${mapping.symbol}X/USD`, 'token');
    const state = itemState(underlying, token);
    const comparable = Boolean(underlying && token && state === 'success');
    return { mint, state, comparison: comparable ? 'cross-feed-context' : 'not-comparable', ...(comparable ? { comparisonRatio: pythRatio(token!, underlying!) } : {}), ...(underlying ? { underlying } : {}), ...(token ? { token } : {}), message: underlying || token ? caveat : absent };
  });
  const usdc = observation(PYTH_USDC_FEED_ID, 'Crypto.USDC/USD', 'currency');
  const expiries = [...items.flatMap(item => [item.underlying, item.token]), usdc].filter(value => value !== undefined).map(value => Date.parse(value.expiresAt));
  return { source: 'pyth', state: summarize(items, usdc), fetchedAt, expiresAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : fetchedAt, items, ...(usdc ? { usdc } : {}), message };
}

/**
 * Keyless. Pyth Lazer answers every pinned feed with no credential, so it is
 * the primary source; the receiver accounts on Solana mainnet are read for the
 * equity and USDC legs as an independent second reading. Where both exist and
 * are fresh they must agree within the tolerance or that leg is withheld; where
 * Lazer cannot be reached, the on-chain legs stand on their own and the token
 * legs are absent rather than invented. Nothing here sends a credential.
 */
async function keylessReferences(mints: string[], now = Date.now()): Promise<MarketReferenceResponse> {
  const expected = PYTH_FEEDS.filter(feed => mints.includes(feed.mint));
  const ids = [...expected.flatMap(feed => [feed.lazerUnderlying, feed.lazerToken]), PYTH_USDC_LAZER_ID];
  let lazer: { reads: Map<number, LazerRead>; fetchedAt: string } | undefined;
  try { lazer = await readLazerFeeds(ids, now); } catch { lazer = undefined; }
  const [usdcChain, ...equityChain] = await Promise.all([readOnchainUsdcObservation(now), ...expected.map(feed => readOnchainEquityObservation(feed, now))]);
  const chain = new Map<string, PythObservation | undefined>([[PYTH_USDC_FEED_ID, usdcChain], ...expected.map((feed, index) => [feed.underlying, equityChain[index]] as const)]);
  const fetchedAt = lazer?.fetchedAt ?? new Date().toISOString();
  const lazerId = (hex: string) => hex === PYTH_USDC_FEED_ID ? PYTH_USDC_LAZER_ID : expected.flatMap(feed => [[feed.underlying, feed.lazerUnderlying], [feed.token, feed.lazerToken]] as const).find(([id]) => id === hex)?.[1];
  const observation: ObservationLookup = (id, symbol, kind) => {
    const numeric = lazerId(id);
    const read = numeric === undefined ? undefined : lazer?.reads.get(numeric);
    const primary = read ? buildPythObservation({ feedId: id, symbol, kind, price: read.price, confidence: read.confidence, exponent: read.exponent, publishTime: read.publishTime, fetchedAt, provenance: 'lazer-proxy', marketSession: read.marketSession }, now) : undefined;
    const second = chain.get(id);
    if (!primary) return second;
    if (!second || primary.state !== 'fresh' || second.state !== 'fresh') return primary;
    try { if (priceDivergenceBps(primary, second) <= USDC_CROSS_CHECK_MAX_BPS) return primary; } catch { /* withheld below */ }
    return undefined;
  };
  const anyChain = [...chain.values()].some(Boolean);
  if (!lazer && !anyChain) return emptyMarketReference(mints, 'unavailable', 'Pyth price references could not be reached or verified.');
  return assembleReferences(observation, mints, fetchedAt, lazer ? keylessScope : chainScope, lazer ? 'Pyth Lazer did not return these price feeds.' : chainScope);
}

/**
 * Keyed: the on-chain post is a second reading of the same aggregate. It fills a
 * missing Hermes currency leg, and when both are fresh it must agree within the
 * tolerance or the currency leg is withheld from the benchmark. An RPC failure
 * changes nothing about the Hermes response.
 */
async function withOnchainUsdc(response: MarketReferenceResponse): Promise<MarketReferenceResponse> {
  const onchain = await readOnchainUsdcObservation();
  if (!onchain) return response;
  if (!response.usdc) return { ...response, usdc: onchain, state: summarize(response.items, onchain) };
  if (response.usdc.state !== 'fresh' || onchain.state !== 'fresh') return response;
  try {
    if (priceDivergenceBps(response.usdc, onchain) <= USDC_CROSS_CHECK_MAX_BPS) return response;
  } catch { /* An unparseable comparison withholds the leg below. */ }
  const withheld: MarketReferenceResponse = { ...response };
  delete withheld.usdc;
  return { ...withheld, state: summarize(withheld.items) };
}

function current(response: MarketReferenceResponse): MarketReferenceResponse {
  if (!response.usdc && !response.items.some(item => item.underlying || item.token)) return response;
  const refresh = (value: PythObservation | undefined): PythObservation | undefined => value && { ...value, state: isPythObservationFresh(value) ? 'fresh' : 'stale' };
  const usdc = refresh(response.usdc);
  const items = response.items.map(item => {
    const underlying = refresh(item.underlying);
    const token = refresh(item.token);
    const state = itemState(underlying, token);
    const refreshed: MarketReferenceItem = { ...item, ...(underlying ? { underlying } : {}), ...(token ? { token } : {}), state };
    if (state !== 'success') {
      refreshed.comparison = 'not-comparable';
      delete refreshed.comparisonRatio;
    }
    return refreshed;
  });
  return { ...response, items, ...(usdc ? { usdc } : {}), state: summarize(items, usdc) };
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

async function fetchReferences(mints: string[], apiKey: string | undefined, endpoint: string): Promise<MarketReferenceResponse> {
  return queue.run(async () => {
    const now = Date.now();
    starts = starts.filter(start => now - start < 60_000);
    if (now < cooldownUntil || starts.length >= 20) throw new ServiceError('unavailable', 'Pyth reference requests are busy. Try again in a minute.');
    starts.push(now);
    const url = new URL(endpoint);
    for (const feed of PYTH_FEEDS.filter(feed => mints.includes(feed.mint))) for (const id of [feed.underlying, feed.token]) url.searchParams.append('ids[]', id);
    url.searchParams.append('ids[]', PYTH_USDC_FEED_ID);
    url.searchParams.set('parsed', 'true');
    const fetchedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }, cache: 'no-store', redirect: 'error', signal: controller.signal });
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
  const apiKey = process.env.PYTH_API_KEY?.trim() || undefined;
  const hermes = hermesEndpoint();
  if (hermes.url === null) return emptyMarketReference(mints, 'configuration-required', 'PYTH_HERMES_URL must be an https origin. Your Jupiter estimates remain available.');
  const ordered = [...mints].sort();
  // Without a key and without an explicit mirror, Hermes answers 401 for every price
  // route, so the currency leg is read from chain and no Hermes request is made.
  if (!apiKey && !hermes.explicit) {
    const keylessKey = `keyless:${ordered.join(',')}`;
    const cachedKeyless = cache.get(keylessKey);
    if (cachedKeyless) return current(cachedKeyless);
    let keyless = pending.get(keylessKey);
    if (!keyless) {
      keyless = keylessReferences(ordered).then(result => { cache.set(keylessKey, result, 5000); return result; }).finally(() => pending.delete(keylessKey));
      pending.set(keylessKey, keyless);
    }
    return current(await keyless);
  }
  const key = ordered.join(',');
  const existing = cache.get(key);
  if (existing) return current(existing);
  let promise = pending.get(key);
  if (!promise) {
    if (pending.size >= MAX_PENDING) return emptyMarketReference(mints, 'unavailable', 'Pyth reference requests are busy. Try again in a minute.');
    promise = fetchReferences(ordered, apiKey, hermes.url).then(withOnchainUsdc).catch(error => emptyMarketReference(ordered, error instanceof ServiceError ? error.kind : 'unavailable', error instanceof ServiceError ? error.message : 'Pyth price references could not be reached or verified.')).then(result => { cache.set(key, result, 5000); return result; }).finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}
