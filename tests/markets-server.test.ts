import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARKET_MINTS, type MarketSnapshot } from '../lib/domain/markets';
import { ServiceError } from '../lib/server/common';
import { buildMarketSnapshot, createMarketStore, normalizeTokens, SNAPSHOT_FRESH_MS, SNAPSHOT_MAX_AGE_MS } from '../lib/server/markets';
import { choosePool, MIN_CHART_POOL_USD, normalizeCandles, readChart } from '../lib/server/market-chart';

const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const NOW = Date.parse('2026-09-28T15:30:00.000Z');
const token = (id: string, over: Record<string, unknown> = {}) => ({
  id, symbol: 'X', usdPrice: 340.45, liquidity: 590_605.58, mcap: 52_519_815, holderCount: 34_706, updatedAt: '2026-09-28T15:26:12.317179292Z',
  stats24h: { priceChange: 0.171, buyVolume: 268_094.5, sellVolume: 333_687.7, numBuys: 4138 }, icon: 'https://example.invalid/logo.png', ...over,
});

describe('market snapshot normalization', () => {
  it('keeps requested mints only, first record wins, and converts upstream times to ISO', () => {
    const stats = normalizeTokens([token(AAPLX), token(AAPLX, { usdPrice: 1 }), token('So11111111111111111111111111111111111111112'), token(NVDAX, { stats24h: null, holderCount: null })], [AAPLX, NVDAX]);
    expect(Object.keys(stats).sort()).toEqual([AAPLX, NVDAX].sort());
    expect(stats[AAPLX]).toEqual({ price: 340.45, change24hPct: 0.171, volume24hUsd: 268_094.5 + 333_687.7, liquidityUsd: 590_605.58, marketCapUsd: 52_519_815, holders: 34_706, updatedAt: '2026-09-28T15:26:12.317Z' });
    expect(stats[NVDAX]).toMatchObject({ change24hPct: null, volume24hUsd: null, holders: null });
  });
  it('drops records with impossible figures and refuses a non-array payload', () => {
    expect(normalizeTokens([token(AAPLX, { usdPrice: -1 }), token(NVDAX, { liquidity: 'lots' })], [AAPLX, NVDAX])).toEqual({});
    expect(normalizeTokens([token(AAPLX, { updatedAt: 'yesterday' })], [AAPLX])[AAPLX].updatedAt).toBeNull();
    expect(() => normalizeTokens({ tokens: [] }, [AAPLX])).toThrow(ServiceError);
  });
});

describe('building a snapshot', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('reads every catalog mint in batches of 100, reserving provider time for each batch', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => { void init; return new URL(url).searchParams.get('query')!.split(',').map(id => token(id)); });
    const reserve = vi.fn(async () => undefined);
    vi.stubEnv('JUPITER_API_KEY', 'test-key');
    const snapshot = await buildMarketSnapshot(MARKET_MINTS, { fetch, reserve, now: () => NOW });
    expect(fetch).toHaveBeenCalledTimes(Math.ceil(MARKET_MINTS.length / 100));
    expect(reserve).toHaveBeenCalledTimes(fetch.mock.calls.length);
    expect(reserve).toHaveBeenCalledWith('jupiter');
    const first = new URL(fetch.mock.calls[0][0]);
    expect(first.origin + first.pathname).toBe('https://api.jup.ag/tokens/v2/search');
    expect(first.searchParams.get('query')!.split(',')).toEqual(MARKET_MINTS.slice(0, 100));
    expect(fetch.mock.calls[0][1]).toEqual({ headers: { 'x-api-key': 'test-key' } });
    expect(snapshot).toMatchObject({ state: 'success', source: 'Jupiter Tokens API', fetchedAt: new Date(NOW).toISOString(), missing: 0 });
    expect(Object.keys(snapshot.stats)).toHaveLength(MARKET_MINTS.length);
  });
  it('reports a partial snapshot when a batch fails, and fails outright when none succeed', async () => {
    let call = 0;
    const flaky = vi.fn(async (url: string) => { call += 1; if (call === 2) throw new ServiceError('unavailable', 'down'); return new URL(url).searchParams.get('query')!.split(',').map(id => token(id)); });
    const partial = await buildMarketSnapshot(MARKET_MINTS, { fetch: flaky, reserve: async () => undefined, now: () => NOW });
    expect(partial).toMatchObject({ state: 'partial', missing: 100 });
    expect(partial.message).toMatch(/^1 of 9 snapshot requests failed/);
    await expect(buildMarketSnapshot(MARKET_MINTS, { fetch: async () => { throw new Error('offline'); }, reserve: async () => undefined, now: () => NOW })).rejects.toThrow(/temporarily unavailable/);
  });
});

describe('snapshot cache', () => {
  const snapshot = (fetchedAt: number): MarketSnapshot => ({ state: 'success', source: 'Jupiter Tokens API', fetchedAt: new Date(fetchedAt).toISOString(), stats: {}, missing: 0 });
  it('serves a fresh snapshot, then a stale one with a refresh, then waits once it is too old', async () => {
    let now = NOW;
    const build = vi.fn(async () => snapshot(now));
    const store = createMarketStore(build, () => now);
    expect((await store.read()).refresh).toBeNull();
    now += SNAPSHOT_FRESH_MS - 1;
    expect((await store.read()).snapshot.stale).toBeUndefined();
    expect(build).toHaveBeenCalledTimes(1);
    now += 2;
    const stale = await store.read();
    expect(stale.snapshot.stale).toBe(true);
    expect(build).toHaveBeenCalledTimes(1);
    await stale.refresh!();
    expect(build).toHaveBeenCalledTimes(2);
    expect((await store.read()).snapshot.stale).toBeUndefined();
    now += SNAPSHOT_MAX_AGE_MS;
    const renewed = await store.read();
    expect(renewed.refresh).toBeNull();
    expect(renewed.snapshot.fetchedAt).toBe(new Date(now).toISOString());
  });
  it('runs one read at a time and never caches a failure', async () => {
    let resolve!: (value: MarketSnapshot) => void;
    const build = vi.fn(() => new Promise<MarketSnapshot>(done => { resolve = done; }));
    const store = createMarketStore(build, () => NOW);
    const first = store.read(); const second = store.read();
    resolve(snapshot(NOW));
    await Promise.all([first, second]);
    expect(build).toHaveBeenCalledTimes(1);
    const failing = createMarketStore(vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(snapshot(NOW)), () => NOW);
    await expect(failing.read()).rejects.toThrow('down');
    await expect(failing.read()).resolves.toMatchObject({ snapshot: { state: 'success' } });
  });
});

describe('price history', () => {
  const pool = (address: string, base: string, quote: string, reserve: string | null, name = 'AAPLx / USDC') => ({ attributes: { address, name, reserve_in_usd: reserve }, relationships: { base_token: { data: { id: `solana_${base}` } }, quote_token: { data: { id: `solana_${quote}` } } } });
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const DEEP = 'CKwJZwm7oj3nu4653N1EpDrqXbXAYXoPFiPeEnLouF8y';
  it('chooses the deepest pool that contains the mint and clears the value floor', () => {
    expect(choosePool({ data: [pool('ApniVWuZbZoruTAJdyJcLBA4AVw4DKGdV5fHxo6qrAZT', AAPLX, USDC, '253235.29'), pool(DEEP, USDC, AAPLX, '291288.30'), pool('EHdow7Yhmr1ac8Qff9Co1LhSosr38puA6zLd4cbJLdpV', NVDAX, USDC, '999999999'), pool('4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie', AAPLX, USDC, String(MIN_CHART_POOL_USD - 1))] }, AAPLX))
      .toEqual({ address: DEEP, name: 'AAPLx / USDC' });
    expect(choosePool({ data: [pool('bad address!', AAPLX, USDC, '1000000'), pool(DEEP, AAPLX, USDC, null)] }, AAPLX)).toBeNull();
    expect(() => choosePool({ pools: [] }, AAPLX)).toThrow(ServiceError);
  });
  it('turns candles into ascending closes inside the window and drops bad ones', () => {
    const hour = 3_600;
    const at = (hoursAgo: number) => Math.floor(NOW / 1000) - hoursAgo * hour;
    const payload = { data: { attributes: { ohlcv_list: [[at(1), 1, 2, 0.5, 341.8, 10], [at(3), 1, 2, 0.5, 340.1, 10], [at(2), 1, 2, 0.5, -3, 10], [at(3), 1, 2, 0.5, 999, 10], [at(200), 1, 2, 0.5, 300, 10], [at(2), 1, 2, 0.5, 339.7, 10]] } } };
    expect(normalizeCandles(payload, '1d', NOW)).toEqual([{ t: at(3) * 1000, c: 340.1 }, { t: at(2) * 1000, c: 339.7 }, { t: at(1) * 1000, c: 341.8 }]);
    expect(() => normalizeCandles({ data: {} }, '1d', NOW)).toThrow(ServiceError);
  });
  it('asks GeckoTerminal for the chosen pool with the range settings, caches the result and explains gaps', async () => {
    const at = (hoursAgo: number) => Math.floor(NOW / 1000) - hoursAgo * 3_600;
    const fetch = vi.fn(async (url: string) => url.includes('/tokens/') ? { data: [pool(DEEP, AAPLX, USDC, '291288.30')] } : { data: { attributes: { ohlcv_list: [[at(8), 1, 1, 1, 340, 1], [at(4), 1, 1, 1, 342, 1]] } } });
    const deps = { fetch, now: () => NOW, run: <T,>(operation: () => Promise<T>) => operation() };
    const chart = await readChart(AAPLX, '7d', deps);
    expect(chart).toMatchObject({ state: 'success', mint: AAPLX, range: '7d', pool: { address: DEEP }, source: 'GeckoTerminal' });
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${AAPLX}/pools?page=1`,
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${DEEP}/ohlcv/hour?aggregate=4&limit=42&currency=usd&token=${AAPLX}`,
    ]);
    await readChart(AAPLX, '7d', deps);
    expect(fetch).toHaveBeenCalledTimes(2);
    await readChart(AAPLX, '30d', deps);
    expect(fetch.mock.calls[2][0]).toContain('/ohlcv/day?aggregate=1&limit=30');
    const noPool = await readChart(NVDAX, '1d', { ...deps, fetch: vi.fn(async () => ({ data: [] })) });
    expect(noPool).toMatchObject({ state: 'unavailable', points: [], message: expect.stringMatching(/No pool/) });
  });
  it('says when the chart source is rate limited', async () => {
    const limited = vi.fn(async () => { throw new ServiceError('unavailable', 'rate limited', 'rate-limited', 429); });
    const MSFTX = 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX';
    expect(await readChart(MSFTX, '1d', { fetch: limited, now: () => NOW, run: operation => operation() })).toMatchObject({ state: 'unavailable', message: 'The chart source is busy. Try again in a minute.' });
  });
});
