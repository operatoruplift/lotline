import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketSnapshot } from '../lib/domain/markets';
import { ServiceError } from '../lib/server/common';

const mocks = vi.hoisted(() => ({ read: vi.fn(), limit: vi.fn(), after: vi.fn(), chart: vi.fn() }));
vi.mock('../lib/server/markets', () => ({ marketStore: { read: mocks.read } }));
vi.mock('../lib/server/read-limits', () => ({ enforceReadRateLimit: mocks.limit }));
vi.mock('../lib/server/market-chart', () => ({ readChart: mocks.chart }));
vi.mock('next/server', async original => ({ ...(await original<typeof import('next/server')>()), after: mocks.after }));

const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const NOW = Date.parse('2026-09-28T15:30:00.000Z');

describe('markets API routes', () => {
  const ok: MarketSnapshot = { state: 'success', source: 'Jupiter Tokens API', fetchedAt: new Date(NOW).toISOString(), stats: {}, missing: 0 };
  beforeEach(() => { vi.stubEnv('LOTLINE_MARKETS_ENABLED', 'true'); mocks.limit.mockResolvedValue(undefined); });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('stays dark until the operator flag is set', async () => {
    const { GET } = await import('../app/api/markets/route');
    const { GET: CHART } = await import('../app/api/markets/chart/route');
    vi.stubEnv('LOTLINE_MARKETS_ENABLED', 'false');
    expect((await GET(new Request('https://lotline.dev/api/markets'))).status).toBe(404);
    expect((await CHART(new Request(`https://lotline.dev/api/markets/chart?mint=${AAPLX}`))).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.chart).not.toHaveBeenCalled();
  });
  it('serves the snapshot with shared caching and refreshes a stale one after responding', async () => {
    const { GET } = await import('../app/api/markets/route');
    mocks.read.mockResolvedValueOnce({ snapshot: ok, refresh: null });
    const fresh = await GET(new Request('https://lotline.dev/api/markets'));
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    expect(mocks.after).not.toHaveBeenCalled();
    const refresh = vi.fn(async () => ok);
    mocks.read.mockResolvedValueOnce({ snapshot: { ...ok, stale: true }, refresh });
    expect(await (await GET(new Request('https://lotline.dev/api/markets'))).json()).toMatchObject({ stale: true });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('refuses parameters and maps limits and failures without caching them', async () => {
    const { GET } = await import('../app/api/markets/route');
    expect((await GET(new Request('https://lotline.dev/api/markets?mint=x'))).status).toBe(400);
    mocks.limit.mockRejectedValueOnce(new ServiceError('unavailable', 'Too many live reads', 'rate-limited'));
    const limited = await GET(new Request('https://lotline.dev/api/markets'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('cache-control')).toBe('no-store');
    mocks.read.mockRejectedValueOnce(new ServiceError('unavailable', 'Market data is temporarily unavailable.'));
    const failed = await GET(new Request('https://lotline.dev/api/markets'));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ state: 'unavailable', message: 'Market data is temporarily unavailable.' });
  });
  it('charts only catalog mints and known ranges', async () => {
    const { GET } = await import('../app/api/markets/chart/route');
    for (const query of ['mint=So11111111111111111111111111111111111111112', `mint=${AAPLX}&range=1y`, `mint=${AAPLX}&mint=${NVDAX}`, `mint=${AAPLX}&pool=abc`, '']) {
      expect((await GET(new Request(`https://lotline.dev/api/markets/chart?${query}`))).status).toBe(400);
    }
    expect(mocks.chart).not.toHaveBeenCalled();
    // Crypto charts only with the crypto flag, like the Crypto tab itself.
    vi.stubEnv('LOTLINE_CRYPTO_ENABLED', 'true');
    mocks.chart.mockResolvedValueOnce({ state: 'unavailable', mint: 'So11111111111111111111111111111111111111112', range: '1d', points: [], source: 'GeckoTerminal', pool: null, fetchedAt: new Date(NOW).toISOString(), message: 'fixture' });
    await GET(new Request('https://lotline.dev/api/markets/chart?mint=So11111111111111111111111111111111111111112'));
    expect(mocks.chart).toHaveBeenCalledWith('So11111111111111111111111111111111111111112', '1d');
    vi.stubEnv('LOTLINE_CRYPTO_ENABLED', '');
    mocks.chart.mockClear();
    mocks.chart.mockResolvedValueOnce({ state: 'success', mint: AAPLX, range: '1d', points: [{ t: 1, c: 2 }, { t: 2, c: 3 }], source: 'GeckoTerminal', pool: null, fetchedAt: new Date(NOW).toISOString() });
    const charted = await GET(new Request(`https://lotline.dev/api/markets/chart?mint=${AAPLX}`));
    expect(charted.status).toBe(200);
    expect(charted.headers.get('cache-control')).toContain('s-maxage=600');
    expect(mocks.chart).toHaveBeenCalledWith(AAPLX, '1d');
    mocks.chart.mockResolvedValueOnce({ state: 'unavailable', mint: AAPLX, range: '7d', points: [], source: 'GeckoTerminal', pool: null, fetchedAt: new Date(NOW).toISOString(), message: 'gap' });
    expect((await GET(new Request(`https://lotline.dev/api/markets/chart?mint=${AAPLX}&range=7d`))).headers.get('cache-control')).toBe('no-store');
  });
});
