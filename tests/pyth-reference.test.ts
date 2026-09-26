import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PYTH_MAPPED_MINTS, PYTH_USDC_FEED_ID, isPythObservationFresh, marketReferenceResponseSchema, pythConfidenceBps, pythDecimal, pythRatio, pythReferencesReady } from '../lib/domain/market-reference';
import { PYTH_FEEDS, parsePythReferences } from '../lib/server/pyth';
import { USDC_RECEIVER_DECODED, rpcResponder } from './fixtures/pyth-onchain';

const now = Date.parse('2026-09-20T19:05:00.000Z');
// The pinned on-chain fixture was published at this second; tests that read it set the clock nearby.
const chainPublish = USDC_RECEIVER_DECODED.publishTime;
const chainNow = (chainPublish + 56) * 1000;
const mapping = PYTH_FEEDS[0];
const fetchedAt = new Date(now).toISOString();
function price(id: string, changes = {}) {
  return { id, price: { price: '23456789012', conf: '1234567', expo: -8, publish_time: now / 1000 - 3, ...changes } };
}
const payload = () => ({ parsed: [price(mapping.underlying), price(mapping.token)] });
const currencyPrice = (changes = {}) => price(PYTH_USDC_FEED_ID, { price: '99990000', conf: '1000', ...changes });
// The RPC stays unconfigured unless a test opts in, so the on-chain currency leg is inert here.
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('PYTH_API_KEY', 'test-server-only-key'); vi.stubEnv('PYTH_HERMES_URL', ''); vi.stubEnv('SOLANA_RPC_URL', ''); });
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
it('retains the pinned USDC/USD currency observation without assuming dollar parity', () => {
  const response = parsePythReferences({ parsed: [...payload().parsed, currencyPrice()] }, [mapping.mint], fetchedAt, now);
  expect(response.usdc).toMatchObject({ feedId: PYTH_USDC_FEED_ID, symbol: 'Crypto.USDC/USD', kind: 'currency', unitBasis: 'usdc-unit', quoteCurrency: 'USD', displayPrice: '0.9999', state: 'fresh', expiresAt: '2026-09-20T19:05:57.000Z' });
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(true);
  expect(isPythObservationFresh(response.usdc!, Date.parse(response.usdc!.expiresAt))).toBe(false);
  const withoutCurrency = parsePythReferences(payload(), [mapping.mint], fetchedAt, now);
  expect(withoutCurrency.usdc).toBeUndefined();
  expect(pythReferencesReady(withoutCurrency, [mapping.mint], now)).toBe(true);
});
it('rejects altered currency identities, currency slots and negative currency prices', () => {
  const response = parsePythReferences({ parsed: [...payload().parsed, currencyPrice()] }, [mapping.mint], fetchedAt, now);
  for (const changes of [{ feedId: mapping.token }, { symbol: 'Crypto.USDT/USD' }, { kind: 'underlying', unitBasis: 'underlying-share' }, { unitBasis: 'unverified-token-unit' }, { price: '-1' }]) {
    expect(marketReferenceResponseSchema.safeParse({ ...response, usdc: { ...response.usdc, ...changes } }).success).toBe(false);
  }
  expect(marketReferenceResponseSchema.safeParse({ ...response, items: [{ ...response.items[0], token: response.usdc }] }).success).toBe(false);
  expect(marketReferenceResponseSchema.safeParse({ ...response, items: [{ ...response.items[0], underlying: response.usdc }] }).success).toBe(false);
  expect(() => parsePythReferences({ parsed: [...payload().parsed, currencyPrice({ price: '-1' })] }, [mapping.mint], fetchedAt, now)).toThrow('unverified price response');
  expect(() => parsePythReferences({ parsed: [...payload().parsed, { ...currencyPrice(), id: 'a'.repeat(64) }] }, [mapping.mint], fetchedAt, now)).toThrow('unverified price response');
  expect(() => parsePythReferences({ parsed: [currencyPrice()] }, [], fetchedAt, now)).toThrow('unverified price response');
});
it('computes asymmetric feed ratios with integer arithmetic and rounds down at eight decimal places', () => {
  expect(pythRatio({ price: '3', exponent: -1 }, { price: '2', exponent: 0 })).toBe('0.15');
  expect(pythRatio({ price: '2', exponent: 0 }, { price: '3', exponent: -1 })).toBe('6.66666666');
  expect(pythRatio({ price: '9007199254740993', exponent: 0 }, { price: '3', exponent: 0 })).toBe('3002399751580331');
  expect(pythRatio({ price: '1', exponent: -12 }, { price: '1', exponent: 12 })).toBe('0');
  expect(pythRatio({ price: '9223372036854775807', exponent: 12 }, { price: '1', exponent: -12 })).toBe('9223372036854775807000000000000000000000000');
});
it.each([
  { price: '0', exponent: 0 }, { price: '-1', exponent: 0 }, { price: 'garbage', exponent: 0 },
  { price: '1e8', exponent: 0 }, { price: '9223372036854775808', exponent: 0 },
  { price: '1', exponent: 13 }, { price: '1', exponent: -13 }, { price: '1', exponent: 0.5 },
  { price: '1', exponent: Number.NaN }, { price: '1', exponent: Number.POSITIVE_INFINITY },
])('rejects invalid ratio inputs before arithmetic %j', observation => {
  const valid = { price: '1', exponent: 0 };
  expect(() => pythRatio(observation, valid)).toThrow('Invalid Pyth ratio.');
  expect(() => pythRatio(valid, observation)).toThrow('Invalid Pyth ratio.');
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
it('validates ratio arithmetic and excludes comparison values from unavailable or stale references', () => {
  const response = parsePythReferences(payload(), [mapping.mint], fetchedAt, now);
  response.items[0].comparisonRatio = '1.00000001';
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(false);
  response.items[0].comparisonRatio = '1';
  response.items[0].comparison = 'not-comparable';
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(false);
  response.items[0].comparison = 'cross-feed-context';
  response.items[0].state = 'stale';
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(false);
  response.items[0].state = 'success';
  response.items[0].token!.exponent = 1000000;
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(false);
  response.items[0].token!.price = 'garbage';
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(false);
});
it('requires every requested mapped mint to have both pinned fresh feeds while ignoring unmapped mints', () => {
  const unmapped = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
  const response = parsePythReferences(payload(), [mapping.mint, unmapped], fetchedAt, now);
  expect(PYTH_MAPPED_MINTS).toEqual(PYTH_FEEDS.map(feed => feed.mint));
  expect(response.state).toBe('partial');
  expect(pythReferencesReady(null, [unmapped], now)).toBe(true);
  expect(pythReferencesReady(null, [mapping.mint], now)).toBe(false);
  expect(pythReferencesReady(response, [mapping.mint, unmapped], now)).toBe(true);
  expect(pythReferencesReady(response, [mapping.mint, PYTH_FEEDS[1].mint], now)).toBe(false);
  expect(pythReferencesReady(response, [mapping.mint], Date.parse(response.expiresAt))).toBe(false);
  expect(pythReferencesReady(response, [mapping.mint], Number.NaN)).toBe(false);
  response.items[0].token!.feedId = PYTH_FEEDS[1].token;
  expect(pythReferencesReady(response, [mapping.mint], now)).toBe(false);
});
it('fails readiness for a missing feed, duplicate mint, forged ratio, or invalid nested arithmetic', () => {
  const response = parsePythReferences({ parsed: [price(mapping.underlying)] }, [mapping.mint], fetchedAt, now);
  expect(pythReferencesReady(response, [mapping.mint], now)).toBe(false);
  const full = parsePythReferences(payload(), [mapping.mint], fetchedAt, now);
  full.items.push(full.items[0]);
  expect(pythReferencesReady(full, [mapping.mint], now)).toBe(false);
  full.items.pop();
  full.items[0].comparisonRatio = '500';
  expect(pythReferencesReady(full, [mapping.mint], now)).toBe(false);
  full.items[0].token!.price = 'garbage';
  expect(pythReferencesReady(full, [mapping.mint], now)).toBe(false);
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
  expect(url.origin + url.pathname).toBe('https://hermes.pyth.network/v2/updates/price/latest');
  expect(url.searchParams.getAll('ids[]')).toEqual([mapping.underlying, mapping.token, PYTH_USDC_FEED_ID]);
  expect(init).toMatchObject({ headers: { Authorization: 'Bearer test-server-only-key' }, cache: 'no-store', redirect: 'error' });
  expect(JSON.stringify(first)).not.toContain('test-server-only-key');
  vi.setSystemTime(now + 4000);
  const cached = await getMarketReferences([mapping.mint]); expect(cached.fetchedAt).toBe(first.fetchedAt); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('requests one currency feed for several mapped assets and keeps missing currency optional', async () => {
  const fetcher = vi.fn(async () => Response.json(payload())); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const response = await getMarketReferences(PYTH_FEEDS.map(feed => feed.mint));
  const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  const ids = url.searchParams.getAll('ids[]');
  expect(ids).toHaveLength(PYTH_FEEDS.length * 2 + 1);
  expect(ids.filter(id => id === PYTH_USDC_FEED_ID)).toHaveLength(1);
  expect(response.usdc).toBeUndefined();
  expect(response.items[0].state).toBe('success');
});
it('ages cached currency from publication without changing the existing equity/token purchase gate', async () => {
  const fetcher = vi.fn(async () => Response.json({ parsed: [...payload().parsed, currencyPrice({ publish_time: now / 1000 - 58 })] }));
  vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const first = await getMarketReferences([mapping.mint]);
  vi.setSystemTime(now + 2000);
  const cached = await getMarketReferences([mapping.mint]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(first.usdc?.state).toBe('fresh');
  expect(cached.usdc?.state).toBe('stale');
  expect(cached.usdc?.publishedAt).toBe(first.usdc?.publishedAt);
  expect(cached.usdc?.expiresAt).toBe(first.usdc?.expiresAt);
  expect(cached.usdc?.fetchedAt).toBe(first.usdc?.fetchedAt);
  expect(isPythObservationFresh(cached.usdc!, now + 2000)).toBe(false);
  expect(pythReferencesReady(cached, [mapping.mint], now + 2000)).toBe(true);
  expect(marketReferenceResponseSchema.safeParse(cached).success).toBe(true);
});
it('reclassifies cached observations when they expire without changing their timestamps', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ parsed: [price(mapping.underlying, { publish_time: now / 1000 - 58 }), price(mapping.token, { publish_time: now / 1000 - 58 })] })));
  const { getMarketReferences } = await import('../lib/server/pyth');
  const first = await getMarketReferences([mapping.mint]); vi.setSystemTime(now + 3000);
  const cached = await getMarketReferences([mapping.mint]); expect(first.state).toBe('success'); expect(cached.state).toBe('stale');
  expect(cached.expiresAt).toBe(first.expiresAt); expect(cached.fetchedAt).toBe(first.fetchedAt);
  expect(first.items[0].comparison).toBe('cross-feed-context');
  expect(cached.items[0].comparison).toBe('not-comparable');
  expect(cached.items[0].comparisonRatio).toBeUndefined();
  expect(marketReferenceResponseSchema.safeParse(cached).success).toBe(true);
});
it('clears cached comparisons as soon as either observation expires', async () => {
  const fetcher = vi.fn(async () => Response.json({ parsed: [price(mapping.underlying, { publish_time: now / 1000 - 58 }), price(mapping.token)] }));
  vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const first = await getMarketReferences([mapping.mint]);
  vi.setSystemTime(now + 2000);
  const cached = await getMarketReferences([mapping.mint]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(cached.state).toBe('partial');
  expect(cached.items[0].comparison).toBe('not-comparable');
  expect(cached.items[0].comparisonRatio).toBeUndefined();
  expect(cached.items[0].underlying?.publishedAt).toBe(first.items[0].underlying?.publishedAt);
  expect(cached.items[0].token?.state).toBe('fresh');
  expect(pythReferencesReady(cached, [mapping.mint])).toBe(false);
  expect(marketReferenceResponseSchema.safeParse(cached).success).toBe(true);
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
it('sends a keyless request only to an explicit https mirror and omits the authorization header', async () => {
  vi.stubEnv('PYTH_API_KEY', ''); vi.stubEnv('PYTH_HERMES_URL', 'https://mirror.example/hermes/');
  const fetcher = vi.fn(async () => new Response('unauthorized', { status: 401 })); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const response = await getMarketReferences([mapping.mint]);
  expect(response.state).toBe('configuration-required'); expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.origin + url.pathname).toBe('https://mirror.example/hermes/v2/updates/price/latest');
  expect(Object.keys(init.headers as Record<string, string>)).not.toContain('Authorization');
});
it('sends the server key to an explicit https mirror', async () => {
  vi.stubEnv('PYTH_HERMES_URL', 'https://pyth.dourolabs.app/hermes');
  const fetcher = vi.fn(async () => Response.json(payload())); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  expect((await getMarketReferences([mapping.mint])).state).toBe('success');
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.origin + url.pathname).toBe('https://pyth.dourolabs.app/hermes/v2/updates/price/latest');
  expect(init).toMatchObject({ headers: { Authorization: 'Bearer test-server-only-key' } });
});
it.each(['http://mirror.example', 'https://mirror.example/?ids[]=x', 'https://user:pw@mirror.example', 'not a url'])('refuses the Hermes override %s without any request', async override => {
  vi.stubEnv('PYTH_HERMES_URL', override);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const response = await getMarketReferences([mapping.mint]);
  expect(response.state).toBe('configuration-required'); expect(fetcher).not.toHaveBeenCalled();
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(true);
});
it('reads USDC/USD keyless from the Solana receiver account while asset items and the purchase gate stay closed', async () => {
  vi.stubEnv('PYTH_API_KEY', ''); vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example');
  vi.setSystemTime(chainNow);
  const fetcher = vi.fn(rpcResponder()); vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const request = getMarketReferences([mapping.mint]);
  await vi.advanceTimersByTimeAsync(1000);
  const response = await request;
  expect(response.state).toBe('partial');
  expect(response.usdc).toMatchObject({ provenance: 'solana-receiver', feedId: PYTH_USDC_FEED_ID, symbol: 'Crypto.USDC/USD', kind: 'currency', price: '99991510', confidence: '16490', exponent: -8, displayPrice: '0.9999151', publishTime: chainPublish, state: 'fresh', expiresAt: new Date((chainPublish + 60) * 1000).toISOString() });
  expect(response.items[0]).toMatchObject({ mint: mapping.mint, state: 'unavailable', comparison: 'not-comparable' });
  expect(response.items[0].message).toContain('receiver account on Solana mainnet');
  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(['https://rpc.example', 'https://rpc.example']);
  expect(marketReferenceResponseSchema.safeParse(response).success).toBe(true);
  expect(pythReferencesReady(response, [mapping.mint], chainNow)).toBe(false);
  const { POST } = await import('../app/api/market-reference/route');
  const routed = POST(new Request('http://localhost/api/market-reference', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mints: [mapping.mint] }) }));
  await vi.advanceTimersByTimeAsync(1000);
  expect((await routed).status).toBe(200);
  // Sixty seconds after the original publish time the cached read reports stale; no new RPC read renews it.
  vi.setSystemTime((chainPublish + 60) * 1000 + 500);
  const later = getMarketReferences([mapping.mint]);
  await vi.advanceTimersByTimeAsync(1000);
  const aged = await later;
  expect(aged.state).toBe('stale'); expect(aged.usdc?.state).toBe('stale'); expect(aged.usdc?.fetchedAt).toBe(response.usdc?.fetchedAt);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('cross-checks a keyed Hermes currency leg against the on-chain post and withholds a divergent reading', async () => {
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example');
  vi.setSystemTime(chainNow);
  const hermesPayload = (usdcPrice?: string) => ({ parsed: [price(mapping.underlying, { publish_time: chainPublish }), price(mapping.token, { publish_time: chainPublish }), ...(usdcPrice ? [currencyPrice({ price: usdcPrice, publish_time: chainPublish })] : [])] });
  const run = async (usdcPrice?: string) => {
    // Each run starts from the same instant: advancing the fake clock across runs would age the observations.
    vi.resetModules(); vi.setSystemTime(chainNow);
    const responder = rpcResponder();
    const fetcher = vi.fn(async (url: URL | string, init?: RequestInit) => String(url).startsWith('https://rpc.example') ? responder(url, init) : Response.json(hermesPayload(usdcPrice)));
    vi.stubGlobal('fetch', fetcher);
    const { getMarketReferences } = await import('../lib/server/pyth');
    const request = getMarketReferences([mapping.mint]);
    await vi.advanceTimersByTimeAsync(2000);
    const response = await request;
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith('https://hermes.pyth.network/v2/updates/price/latest'))).toBe(true);
    expect(marketReferenceResponseSchema.safeParse(response).success).toBe(true);
    return response;
  };
  // 0.15 basis points from the on-chain 99991510: the Hermes reading stands, labelled as Hermes.
  const agreeing = await run('99990000');
  expect(agreeing.state).toBe('success');
  expect(agreeing.usdc).toMatchObject({ provenance: 'hermes', price: '99990000', state: 'fresh' });
  // About 199 basis points apart: the currency leg is withheld; the equity/token items are untouched.
  const divergent = await run('98000000');
  expect(divergent.state).toBe('success'); expect(divergent.usdc).toBeUndefined(); expect(divergent.items[0].state).toBe('success');
  // Hermes omitted the currency feed: the on-chain post fills the leg under its own label.
  const filled = await run();
  expect(filled.state).toBe('success');
  expect(filled.usdc).toMatchObject({ provenance: 'solana-receiver', price: '99991510', state: 'fresh' });
});
it('keeps a keyed Hermes response intact when the RPC read fails', async () => {
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example');
  vi.setSystemTime(chainNow);
  const fetcher = vi.fn(async (url: URL | string) => String(url).startsWith('https://rpc.example') ? new Response('', { status: 503 }) : Response.json({ parsed: [price(mapping.underlying, { publish_time: chainPublish }), price(mapping.token, { publish_time: chainPublish }), currencyPrice({ publish_time: chainPublish })] }));
  vi.stubGlobal('fetch', fetcher);
  const { getMarketReferences } = await import('../lib/server/pyth');
  const request = getMarketReferences([mapping.mint]);
  await vi.advanceTimersByTimeAsync(2000);
  const response = await request;
  expect(response.state).toBe('success');
  expect(response.usdc).toMatchObject({ provenance: 'hermes', price: '99990000' });
});
