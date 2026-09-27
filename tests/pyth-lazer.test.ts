import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PYTH_FEED_MAPPINGS, PYTH_USDC_LAZER_ID } from '../lib/domain/market-reference';
import { LAZER_DEFAULT_HOSTS, lazerHosts, normaliseSession, parseLazerPayload } from '../lib/server/pyth-lazer';
import { LAZER_FETCHED_AT, LAZER_HOSTS, LAZER_LIVE_FEEDS, LAZER_LIVE_PAYLOAD, lazerPayload, lazerResponder } from './fixtures/pyth-lazer';

// 2.4 seconds after the live answer: every publish time in the fixture is in the past.
const now = Date.parse(LAZER_FETCHED_AT) + 2400;
const aapl = PYTH_FEED_MAPPINGS[0];
const ALL_IDS: ReadonlySet<number> = new Set([...PYTH_FEED_MAPPINGS.flatMap(mapping => [mapping.lazerUnderlying, mapping.lazerToken]), PYTH_USDC_LAZER_ID]);
const usdcFeed = LAZER_LIVE_FEEDS.find(feed => feed.priceFeedId === PYTH_USDC_LAZER_ID)!;
// The adapter is re-imported after every module reset, so its error class is matched by shape, not identity.
const kind = (error: unknown) => (error && typeof error === 'object' && 'kind' in error ? String(error.kind) : 'not-a-service-error');

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('PYTH_LAZER_URL', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

/** Runs the queue's timers while a read is in flight and returns its outcome without an unhandled rejection. */
async function settle<T>(promise: Promise<T>, ms = 3000): Promise<{ value?: T; error?: unknown }> {
  const outcome = promise.then(value => ({ value }), (error: unknown) => ({ error }));
  await vi.advanceTimersByTimeAsync(ms);
  return outcome;
}
const lazerUrl = (call: unknown[]) => new URL(String(call[0]));

it('parses the live proxy answer exactly: seven feeds, publish times in seconds and the session flags Pyth sends', () => {
  const reads = parseLazerPayload(LAZER_LIVE_PAYLOAD, ALL_IDS, now);
  expect(reads.size).toBe(7);
  expect(reads.get(PYTH_USDC_LAZER_ID)).toEqual({ id: 7, price: '99989901', confidence: '26299', exponent: -8, publishTime: 1790495857, marketSession: 'regular' });
  expect(reads.get(aapl.lazerUnderlying)).toEqual({ id: 922, price: '34143006', confidence: '4994', exponent: -5, publishTime: 1790380799, marketSession: 'closed' });
  expect(reads.get(aapl.lazerToken)).toMatchObject({ id: 1792, price: '34137990237', exponent: -8, publishTime: 1790495857, marketSession: 'regular' });
  // The equities carry Friday's last print, published at 23:59:59 UTC, and Pyth flags the session closed.
  expect(new Date(reads.get(922)!.publishTime * 1000).toISOString()).toBe('2026-09-25T23:59:59.000Z');
  for (const mapping of PYTH_FEED_MAPPINGS) expect(reads.get(mapping.lazerUnderlying)?.marketSession).toBe('closed');
});
it('accepts a subset with string-typed numbers and normalises session names without guessing at unknown ones', () => {
  const payload = lazerPayload({ 7: { confidence: '26299' as unknown as number, feedUpdateTimestamp: '1790495857600000' as unknown as number, marketSession: 'pre_market' } }, [922, 1792, 1292, 3116, 1314, 1833]);
  expect(parseLazerPayload(payload, new Set([7]), now).get(7)).toMatchObject({ confidence: '26299', publishTime: 1790495857, marketSession: 'pre-market' });
  expect(normaliseSession('regular')).toBe('regular');
  expect(normaliseSession('closed')).toBe('closed');
  expect(normaliseSession('PRE')).toBe('pre-market');
  expect(normaliseSession('post_market')).toBe('after-hours');
  expect(normaliseSession('after_hours')).toBe('after-hours');
  expect(normaliseSession('lunch')).toBe('unknown');
  expect(normaliseSession(undefined)).toBe('unknown');
});
it.each<[string, unknown, ReadonlySet<number>?]>([
  ['an id that was not asked for', LAZER_LIVE_PAYLOAD, new Set([7])],
  ['a repeated id', { priceFeeds: [usdcFeed, usdcFeed] }],
  ['confidence at the price', lazerPayload({ 7: { confidence: 99989901 } })],
  ['a publish time in the future', lazerPayload({ 7: { feedUpdateTimestamp: (Math.floor(now / 1000) + 1) * 1_000_000 } })],
  ['a zero price', lazerPayload({ 7: { price: '0' } })],
  ['a negative price', lazerPayload({ 7: { price: '-1' } })],
  ['a price beyond int64', lazerPayload({ 7: { price: '9223372036854775808' } })],
  ['an exponent beyond twelve', lazerPayload({ 7: { exponent: 13 } })],
  ['a fractional confidence', lazerPayload({ 7: { confidence: 1.5 } })],
  ['a non-object body', 'nope'],
  ['a missing feed list', { timestampUs: '1' }],
  ['more than twenty feeds', { priceFeeds: Array.from({ length: 21 }, (_, index) => ({ ...usdcFeed, priceFeedId: index })) }, new Set(Array.from({ length: 21 }, (_, index) => index))],
])('rejects %s before any price is read', (_label, payload, expected = ALL_IDS) => {
  expect(() => parseLazerPayload(payload, expected, now)).toThrow('unverified price response');
});
it('rejects an unusable clock rather than trusting a publish time it cannot bound', () => {
  expect(() => parseLazerPayload(LAZER_LIVE_PAYLOAD, ALL_IDS, Number.NaN)).toThrow('unverified price response');
});
it('tries the three public hosts in order by default and accepts only an https origin as an override', () => {
  expect(lazerHosts()).toEqual(LAZER_DEFAULT_HOSTS);
  expect(LAZER_DEFAULT_HOSTS).toEqual(LAZER_HOSTS);
  vi.stubEnv('PYTH_LAZER_URL', 'https://lazer.example/proxy/');
  expect(lazerHosts()).toEqual(['https://lazer.example/proxy']);
  for (const override of ['http://lazer.example', 'https://lazer.example/?ids=1', 'https://u:p@lazer.example', 'https://lazer.example/#latest', 'not a url']) {
    vi.stubEnv('PYTH_LAZER_URL', override);
    expect(lazerHosts()).toBeNull();
  }
});
it('requests the pinned ids once, keyless, without redirects, and serves repeats from a five-second cache', async () => {
  const fetcher = vi.fn(lazerResponder()); vi.stubGlobal('fetch', fetcher);
  const { readLazerFeeds } = await import('../lib/server/pyth-lazer');
  const first = readLazerFeeds([922, 7, 1792, 922]);
  const simultaneous = readLazerFeeds([7, 922, 1792]);
  await vi.advanceTimersByTimeAsync(3000);
  const batch = await first;
  expect(await simultaneous).toBe(batch);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url = lazerUrl(fetcher.mock.calls[0]);
  expect(url.origin).toBe(LAZER_HOSTS[0]);
  expect(url.pathname).toBe('/v1/latest_price');
  expect(url.searchParams.getAll('price_feed_ids')).toEqual(['7', '922', '1792']);
  const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(Object.keys(init.headers as Record<string, string>).map(key => key.toLowerCase())).not.toContain('authorization');
  expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' });
  expect(init.signal).toBeDefined();
  expect(batch.reads.size).toBe(3);
  expect(batch.fetchedAt).toBe(new Date(now).toISOString());
  expect(batch.reads.get(922)).toMatchObject({ price: '34143006', marketSession: 'closed' });
  const cached = await settle(readLazerFeeds([7, 922, 1792]), 1000);
  expect(cached.value).toBe(batch);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  const renewed = await settle(readLazerFeeds([7, 922, 1792]));
  expect(renewed.value).not.toBe(batch);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('moves to the next host when one fails and stops for a minute on a rate limit instead of rotating around it', async () => {
  const answer = lazerResponder();
  const fetcher = vi.fn(async (url: URL | string) => (new URL(String(url)).origin === LAZER_HOSTS[0] ? new Response('', { status: 503 }) : answer(url)));
  vi.stubGlobal('fetch', fetcher);
  const { readLazerFeeds } = await import('../lib/server/pyth-lazer');
  const outcome = await settle(readLazerFeeds([7]));
  expect(outcome.value?.reads.get(7)?.price).toBe('99989901');
  expect(fetcher.mock.calls.map(lazerUrl).map(url => url.origin)).toEqual([LAZER_HOSTS[0], LAZER_HOSTS[1]]);
  vi.resetModules();
  const limited = vi.fn(async () => new Response('', { status: 429 })); vi.stubGlobal('fetch', limited);
  const fresh = await import('../lib/server/pyth-lazer');
  const first = await settle(fresh.readLazerFeeds([7]));
  expect(kind(first.error)).toBe('unavailable');
  expect(String((first.error as Error).message)).toContain('rate limit');
  expect(limited).toHaveBeenCalledTimes(1);
  const second = await settle(fresh.readLazerFeeds([7]));
  expect(kind(second.error)).toBe('unavailable');
  expect(limited).toHaveBeenCalledTimes(1);
});
it('refuses an unverified or unsupported body and never exposes a partial batch', async () => {
  const bodies: (() => Response)[] = [
    () => Response.json({ priceFeeds: [{ ...usdcFeed, priceFeedId: 1 }] }),
    () => Response.json({ priceFeeds: [usdcFeed, { ...usdcFeed, priceFeedId: 922 }] }),
    () => new Response('not json', { status: 200 }),
    () => new Response('x', { headers: { 'content-type': 'application/json', 'content-length': '999999' } }),
    () => new Response('x'.repeat(270_000), { headers: { 'content-type': 'application/json' } }),
  ];
  for (const body of bodies) {
    vi.resetModules();
    const fetcher = vi.fn(async () => body()); vi.stubGlobal('fetch', fetcher);
    const { readLazerFeeds } = await import('../lib/server/pyth-lazer');
    const outcome = await settle(readLazerFeeds([7]));
    expect(outcome.value).toBeUndefined();
    expect(kind(outcome.error)).toBe('unavailable');
    // Every host was tried and every one refused; nothing was cached.
    expect(fetcher).toHaveBeenCalledTimes(LAZER_HOSTS.length);
  }
});
it('rejects invalid id sets and an unusable override without sending anything', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { readLazerFeeds } = await import('../lib/server/pyth-lazer');
  for (const ids of [[], [-1], [1.5], Array.from({ length: 21 }, (_, index) => index)]) {
    const outcome = await settle(readLazerFeeds(ids), 10);
    expect(kind(outcome.error)).toBe('invalid-input');
  }
  vi.stubEnv('PYTH_LAZER_URL', 'http://lazer.example');
  const refused = await settle(readLazerFeeds([7]), 10);
  expect(kind(refused.error)).toBe('configuration-required');
  expect(fetcher).not.toHaveBeenCalled();
});
it('cancels a slow body when its timeout expires', async () => {
  const cancel = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel }), { headers: { 'content-type': 'application/json' } })));
  const { readLazerFeeds } = await import('../lib/server/pyth-lazer');
  const outcome = await settle(readLazerFeeds([7]), 3 * 6600);
  expect(kind(outcome.error)).toBe('unavailable');
  expect(cancel).toHaveBeenCalled();
});
