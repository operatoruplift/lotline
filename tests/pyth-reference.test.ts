import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isPythObservationFresh, marketReferenceResponseSchema, pythConfidenceBps, pythDecimal } from '../lib/domain/market-reference';
import { PYTH_FEEDS, parsePythReferences } from '../lib/server/pyth';

const now = Date.parse('2026-09-20T19:05:00.000Z');
const mapping = PYTH_FEEDS[0];
const fetchedAt = new Date(now).toISOString();
function price(id: string, changes = {}) {
  return { id, price: { price: '23456789012', conf: '1234567', expo: -8, publish_time: now / 1000 - 3, ...changes } };
}
const payload = () => ({ parsed: [price(mapping.underlying), price(mapping.token)] });
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('PYTH_API_KEY', 'test-server-only-key'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('retains exact mantissas, exponent and original observation times without price equivalence', () => {
  const response = parsePythReferences(payload(), [mapping.mint], fetchedAt, now);
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(true);
  expect(response.items[0]).toMatchObject({ state: 'success', comparison: 'cross-feed-context', comparisonRatio: '1', underlying: { unitBasis: 'underlying-share', price: '23456789012', displayPrice: '234.56789012', displayConfidence: '0.01234567', confidenceBps: '0.5263', state: 'fresh', expiresAt: '2026-09-20T19:05:57.000Z' }, token: { unitBasis: 'unverified-token-unit' } });
  expect(response.items[0].message).toContain('context only');
  // The ratio is arithmetic between two feeds, never a verified premium or execution price.
  expect(response.items[0].message).toContain('not verified against an underlying share');
});
it('renders integers beyond Number precision exactly and handles positive and negative exponents', () => {
  expect(pythDecimal('9223372036854775807', -8)).toBe('92233720368.54775807');
  expect(pythDecimal('1', -12)).toBe('0.000000000001');
  expect(pythDecimal('123000', -3)).toBe('123');
  expect(pythDecimal('42', 3)).toBe('42000');
  expect(pythDecimal('0', -8)).toBe('0');
  expect(pythConfidenceBps('1000000000000000000', '100000000000000')).toBe('1');
});
it('treats exact sixty-second expiry as stale, preserves weekend observations, and never extends freshness', () => {
  const data = payload(); data.parsed[0] = price(mapping.underlying, { publish_time: now / 1000 - 172800 });
  const response = parsePythReferences(data, [mapping.mint], fetchedAt, now);
  expect(response.state).toBe('partial'); expect(response.items[0].underlying?.state).toBe('stale');
  const token = response.items[0].token!;
  expect(isPythObservationFresh(token, Date.parse(token.expiresAt) - 1)).toBe(true);
  expect(isPythObservationFresh(token, Date.parse(token.expiresAt))).toBe(false);
  expect(isPythObservationFresh(token, token.publishTime * 1000 - 1)).toBe(false);
  const stale = parsePythReferences({ parsed: [price(mapping.underlying, { publish_time: now / 1000 - 60 })] }, [mapping.mint], fetchedAt, now);
  expect(stale.state).toBe('stale');
});
it.each([
  { price: '0' }, { price: '-1' }, { price: '1e8' }, { price: '9223372036854775808' },
  { conf: '-1' }, { conf: '99999999999999999999' }, { conf: '23456789012' }, { conf: 'garbage' },
  { expo: -13 }, { expo: 13 }, { expo: 0.5 }, { publish_time: now / 1000 + 1 }, { publish_time: 0 },
])('rejects unsafe or future values %j', changes => {
  expect(() => parsePythReferences({ parsed: [price(mapping.underlying, changes)] }, [mapping.mint], fetchedAt, now)).toThrow('unverified price response');
});
it('rejects duplicate, unknown, excessive feed IDs and accepts missing feeds as partial availability', () => {
  for (const parsed of [[price(mapping.underlying), price(mapping.underlying)], [price('a'.repeat(64))], Array.from({ length: 21 }, () => price(mapping.underlying))]) {
    expect(() => parsePythReferences({ parsed }, [mapping.mint], fetchedAt, now)).toThrow();
  }
  expect(parsePythReferences({ parsed: [price(mapping.token)] }, [mapping.mint], fetchedAt, now).state).toBe('partial');
  expect(parsePythReferences({ parsed: [] }, [mapping.mint], fetchedAt, now).state).toBe('unavailable');
});
it('rejects forged display amounts and metadata in the browser schema without throwing on invalid integers', () => {
  const response = parsePythReferences(payload(), [mapping.mint], fetchedAt, now);
  response.items[0].token!.displayPrice = '999';
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(false);
  response.items[0].token!.price = 'garbage';
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(false);
});
it('does not call an upstream without a server key and does not invent fallback observations', async () => {
  vi.stubEnv('PYTH_API_KEY', ''); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const response = await getMarketReferences([mapping.mint]);
  expect(response.state).toBe('configuration-required'); expect(response.items[0].token).toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled(); expect(marketReferenceResponseSchema.safeParse(response).success).toBe(true);
});
it('requests only pinned IDs with a server authorization header, bounded timeout and no redirects', async () => {
  const fetcher = vi.fn(async () => Response.json(payload())); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const [first, simultaneous] = await Promise.all([getMarketReferences([mapping.mint]), getMarketReferences([mapping.mint])]);
  expect(first).toEqual(simultaneous); expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.origin + url.pathname).toBe('https://pyth.dourolabs.app/hermes/v2/updates/price/latest');
  expect(url.searchParams.getAll('ids[]')).toEqual([mapping.underlying, mapping.token]);
  expect(init).toMatchObject({ headers: { Authorization: 'Bearer test-server-only-key' }, cache: 'no-store', redirect: 'error' });
  expect(JSON.stringify(first)).not.toContain('test-server-only-key');
  vi.setSystemTime(now + 4000);
  const cached = await getMarketReferences([mapping.mint]); expect(cached.fetchedAt).toBe(first.fetchedAt); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('reclassifies cached observations when they expire without changing their timestamps', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ parsed: [price(mapping.underlying, { publish_time: now / 1000 - 58 }), price(mapping.token, { publish_time: now / 1000 - 58 })] })));
  const { getMarketReferences } = await import('../lib/server/pyth');
  const first = await getMarketReferences([mapping.mint]); vi.setSystemTime(now + 3000);
  const cached = await getMarketReferences([mapping.mint]); expect(first.state).toBe('success'); expect(cached.state).toBe('stale');
  expect(cached.expiresAt).toBe(first.expiresAt); expect(cached.fetchedAt).toBe(first.fetchedAt);
});
it.each([401, 403, 429, 503])('sanitizes upstream HTTP %s and retains access failure on cache hits', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('test-server-only-key private provider detail', { status })));
  const { getMarketReferences } = await import('../lib/server/pyth');
  for (let i = 0; i < 2; i++) {
    const response = await getMarketReferences([mapping.mint]);
    expect(response.state).toBe(status === 401 || status === 403 ? 'configuration-required' : 'unavailable');
    expect(JSON.stringify(response)).not.toContain('test-server-only-key'); expect(response.items[0].underlying).toBeUndefined();
  }
});
it('rejects unexpected response types and excessive body sizes before exposing prices', async () => {
  for (const response of [new Response('not-json'), new Response('x', { headers: { 'content-type': 'application/json', 'content-length': '999999' } }), new Response('x'.repeat(270000), { headers: { 'content-type': 'application/json' } })]) {
    vi.resetModules(); vi.stubGlobal('fetch', vi.fn(async () => response));
    const { getMarketReferences } = await import('../lib/server/pyth');
    expect((await getMarketReferences([mapping.mint])).state).toBe('unavailable');
  }
});
it('cancels a slow body when its timeout expires', async () => {
  const cancel = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel }), { headers: { 'content-type': 'application/json' } })));
  const { getMarketReferences } = await import('../lib/server/pyth');
  const request = getMarketReferences([mapping.mint]);
  await vi.advanceTimersByTimeAsync(6501);
  expect((await request).state).toBe('unavailable'); expect(cancel).toHaveBeenCalledTimes(1);
});
it('bounds callers to catalog mints, preserves unmapped assets, and validates route bodies', async () => {
  const fetcher = vi.fn(async () => Response.json(payload())); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const unmapped = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
  expect((await getMarketReferences([unmapped])).state).toBe('unavailable'); expect(fetcher).not.toHaveBeenCalled();
  const mixed = await getMarketReferences([mapping.mint, unmapped]); expect(mixed.state).toBe('partial'); expect(mixed.items.find(item => item.mint === unmapped)?.state).toBe('unavailable');
  const { POST } = await import('../app/api/market-reference/route');
  for (const body of [{ mints: [mapping.mint, mapping.mint] }, { mints: ['bad'] }, { mints: [mapping.mint], feedIds: ['a'.repeat(64)] }, { mints: Array(11).fill(mapping.mint) }, { mints: ['11111111111111111111111111111111'] }, { data: 'x'.repeat(5000) }]) {
    const response = await POST(new Request('http://localhost/api/market-reference', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    expect(response.status).toBe(400); expect(response.headers.get('cache-control')).toBe('no-store');
  }
});
