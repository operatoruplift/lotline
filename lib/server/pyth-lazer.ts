import 'server-only';
import { z } from 'zod';
import { PYTH_MARKET_SESSIONS, type PythMarketSession } from '../domain/market-reference';
import { BoundedCache, ServiceError, SpacedQueue } from './common';

/**
 * Pyth's Lazer proxy serves the same aggregates as Hermes over plain HTTP with
 * no credential. On 2026-09-27 it answered all seven pinned feeds keyless: the
 * four round-the-clock legs under a second old and the three equities at their
 * last session print, each flagged with its trading session, and its symbol
 * registry publishes every feed's hermes_id beside its Lazer id, which is how
 * the numeric ids below are verified. Three hosts front it; they are tried in
 * order and an operator may pin one with PYTH_LAZER_URL.
 */
export const LAZER_DEFAULT_HOSTS = [
  'https://pyth-lazer-proxy-3.dourolabs.app',
  'https://pyth-lazer-proxy-1.dourolabs.app',
  'https://pyth-lazer-proxy-2.dourolabs.app',
] as const;
const LATEST_PATH = '/v1/latest_price';
const MAX_BYTES = 256 * 1024;
const MAX_IDS = 20;
const MAX_PENDING = 4;
const CACHE_TTL_MS = 5000;
const queue = new SpacedQueue(1100, MAX_PENDING);
const cache = new BoundedCache<LazerBatch>(32);
const pending = new Map<string, Promise<LazerBatch>>();
let starts: number[] = [];
let cooldownUntil = 0;

export type LazerRead = { id: number; price: string; confidence: string; exponent: number; publishTime: number; marketSession: PythMarketSession };
export type LazerBatch = { reads: Map<number, LazerRead>; fetchedAt: string };

/** Default hosts, or a single https origin from the environment; null when the override is unusable. */
export function lazerHosts(): readonly string[] | null {
  const override = process.env.PYTH_LAZER_URL?.trim();
  if (!override) return LAZER_DEFAULT_HOSTS;
  try {
    const parsed = new URL(override);
    if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    return [`${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`];
  } catch { return null; }
}

const integer = /^(0|[1-9][0-9]{0,19})$/;
const feedSchema = z.object({
  priceFeedId: z.number().int().min(0).max(1_000_000),
  price: z.string().regex(/^[1-9][0-9]{0,18}$/),
  exponent: z.number().int().min(-12).max(12),
  confidence: z.union([z.number().int().min(0), z.string().regex(integer)]),
  marketSession: z.string().max(32).optional(),
  feedUpdateTimestamp: z.union([z.number().int().min(0), z.string().regex(integer)]),
}).passthrough();
const payloadSchema = z.object({ priceFeeds: z.array(feedSchema).max(MAX_IDS) }).passthrough();

/** Pyth's session names, normalised; anything unrecognised is kept as unknown rather than guessed. */
export function normaliseSession(value: string | undefined): PythMarketSession {
  const session = (value ?? '').toLowerCase().replace(/_/g, '-');
  if (session === 'pre' || session === 'premarket') return 'pre-market';
  if (session === 'post' || session === 'post-market' || session === 'afterhours') return 'after-hours';
  return (PYTH_MARKET_SESSIONS as readonly string[]).includes(session) ? session as PythMarketSession : 'unknown';
}

/**
 * Validates one bounded response before exposing any price. Every returned id
 * must be one that was asked for, no id may repeat, and a publish time in the
 * future or a confidence at or above the price rejects the whole batch.
 */
export function parseLazerPayload(payload: unknown, expectedIds: ReadonlySet<number>, now = Date.now()): Map<number, LazerRead> {
  const unverified = () => new ServiceError('unavailable', 'Pyth Lazer returned an unverified price response.');
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success || !Number.isFinite(now)) throw unverified();
  const reads = new Map<number, LazerRead>();
  for (const feed of parsed.data.priceFeeds) {
    if (!expectedIds.has(feed.priceFeedId) || reads.has(feed.priceFeedId)) throw unverified();
    const confidence = String(feed.confidence);
    if (!integer.test(confidence) || BigInt(confidence) >= BigInt(feed.price) || BigInt(feed.price) > 9_223_372_036_854_775_807n) throw unverified();
    const micros = BigInt(feed.feedUpdateTimestamp);
    const publishTime = Number(micros / 1_000_000n);
    if (!Number.isSafeInteger(publishTime) || publishTime < 1 || publishTime > 4_102_444_800 || publishTime > Math.floor(now / 1000)) throw unverified();
    reads.set(feed.priceFeedId, { id: feed.priceFeedId, price: feed.price, confidence, exponent: feed.exponent, publishTime, marketSession: normaliseSession(feed.marketSession) });
  }
  return reads;
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES || !response.body) {
    await response.body?.cancel();
    throw new ServiceError('unavailable', 'Pyth Lazer returned an unsupported response.');
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

async function fetchHost(host: string, ids: readonly number[], now: number): Promise<unknown> {
  const url = new URL(`${host}${LATEST_PATH}`);
  for (const id of ids) url.searchParams.append('price_feed_ids', String(id));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    // No credential of any kind is sent: the proxy is keyless by design.
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) { cooldownUntil = now + 60_000; throw new ServiceError('unavailable', 'Pyth Lazer rate limit reached. Try again in a minute.'); }
      throw new ServiceError('unavailable', 'Pyth Lazer is temporarily unavailable.');
    }
    return await readBoundedJson(response, controller.signal);
  } finally { clearTimeout(timer); }
}

/**
 * One coalesced, cached read of the given numeric feeds. Hosts are tried in
 * order; a rate limit stops the attempt for a minute rather than rotating
 * around it. Any failure surfaces as a ServiceError so the caller can fall
 * back to the on-chain receiver accounts without inventing an observation.
 */
export async function readLazerFeeds(ids: readonly number[], now = Date.now()): Promise<LazerBatch> {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  if (!unique.length || unique.length > MAX_IDS || unique.some(id => !Number.isInteger(id) || id < 0)) throw new ServiceError('invalid-input', 'The Pyth Lazer feed ids are invalid.');
  const hosts = lazerHosts();
  if (!hosts) throw new ServiceError('configuration-required', 'PYTH_LAZER_URL must be an https origin. Your Jupiter estimates remain available.');
  const key = unique.join(',');
  const cached = cache.get(key);
  if (cached) return cached;
  let promise = pending.get(key);
  if (!promise) {
    if (pending.size >= MAX_PENDING) throw new ServiceError('unavailable', 'Pyth Lazer requests are busy. Try again in a minute.');
    promise = queue.run(async () => {
      starts = starts.filter(start => now - start < 60_000);
      if (now < cooldownUntil || starts.length >= 20) throw new ServiceError('unavailable', 'Pyth Lazer requests are busy. Try again in a minute.');
      starts.push(now);
      const fetchedAt = new Date().toISOString();
      const expected = new Set(unique);
      let lastError: unknown;
      for (const host of hosts) {
        try {
          const reads = parseLazerPayload(await fetchHost(host, unique, now), expected, now);
          const batch = { reads, fetchedAt };
          cache.set(key, batch, CACHE_TTL_MS);
          return batch;
        } catch (error) {
          lastError = error;
          if (now < cooldownUntil) break;
        }
      }
      throw lastError instanceof ServiceError ? lastError : new ServiceError('unavailable', 'Pyth Lazer could not be reached.');
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}
