import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKPACK_UNDERLYINGS, backpackListed, impliedUsdcPerUnit, isRailFresh, priceDifferenceBps, scaled, underlyingOf } from '../lib/domain/rails';

const MU = 'XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav';
const AAPL = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const markets = [
  { symbol: 'MU.US_USDC', baseSymbol: 'MU.US', quoteSymbol: 'USDC', marketType: 'SPOT', orderBookState: 'Open' },
  { symbol: 'SPCX.US_USDC', baseSymbol: 'SPCX.US', quoteSymbol: 'USDC', marketType: 'SPOT', orderBookState: 'Open' },
  { symbol: 'SOL_USDC', baseSymbol: 'SOL', quoteSymbol: 'USDC', marketType: 'SPOT', orderBookState: 'Open' },
  { symbol: 'NKE.US_USDC', baseSymbol: 'NKE.US', quoteSymbol: 'USDC', marketType: 'SPOT', orderBookState: 'Closed' },
];
const ticker = { symbol: 'MU.US_USDC', firstPrice: '1092.73', high: '1099.02', lastPrice: '1089.74', low: '1084.28', priceChange: '-2.99', priceChangePercent: '-0.002736', quoteVolume: '1722.3238', trades: '12', volume: '1.58' };

describe('venue comparison arithmetic', () => {
  it('derives the underlying from an xStock symbol and knows which ones Backpack lists', () => {
    expect(underlyingOf('MUx')).toBe('MU');
    expect(underlyingOf('BRK.Bx')).toBe('BRK.B');
    expect(underlyingOf('USDC')).toBeNull();
    expect(backpackListed('MUx')).toBe(true);
    expect(backpackListed('AAPLx')).toBe(false);
    expect(BACKPACK_UNDERLYINGS).toContain('SPCX');
  });
  it('prices a quote per unit with exact integer arithmetic, truncated to six decimals', () => {
    // 100 USDC for 0.0917 units is 1090.512541 per unit, truncated not rounded.
    expect(impliedUsdcPerUnit('100000000', '0.0917')).toBe('1090.512540');
    expect(impliedUsdcPerUnit('10000000', '1')).toBe('10.000000');
    expect(impliedUsdcPerUnit('1', '3')).toBe('0.000000');
    expect(impliedUsdcPerUnit('100000000', '0')).toBeNull();
    expect(impliedUsdcPerUnit('100000000', null)).toBeNull();
    expect(impliedUsdcPerUnit('1e8', '1')).toBeNull();
    expect(scaled('12.5')).toBe(1_250_000_000n);
    expect(scaled('abc')).toBeNull();
  });
  it('states the difference in signed basis points, truncated toward zero', () => {
    expect(priceDifferenceBps('1090.512540', '1089.74')).toBe('7');
    expect(priceDifferenceBps('1000', '1100')).toBe('-909');
    expect(priceDifferenceBps('1100', '1100')).toBe('0');
    expect(priceDifferenceBps(null, '1100')).toBeNull();
    expect(priceDifferenceBps('1', '0')).toBeNull();
  });
  it('treats a read as current only inside its own thirty-second window', () => {
    const item = { fetchedAt: '2026-09-27T10:00:00.000Z', expiresAt: '2026-09-27T10:00:30.000Z' };
    expect(isRailFresh(item, Date.parse('2026-09-27T10:00:29.999Z'))).toBe(true);
    expect(isRailFresh(item, Date.parse('2026-09-27T10:00:30.000Z'))).toBe(false);
    expect(isRailFresh(item, Date.parse('2026-09-27T09:59:59.999Z'))).toBe(false);
  });
});

describe('rails route', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const post = async (body: unknown) => {
    const { POST } = await import('../app/api/rails/route');
    return POST(new Request('http://localhost/api/rails', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  };
  const fetcher = (over: Partial<Record<'markets' | 'ticker', () => Response>> = {}) => vi.fn(async (input: URL | string, init?: RequestInit) => {
    void init;
    const url = new URL(String(input));
    if (url.pathname === '/api/v1/markets') return (over.markets ?? (() => Response.json(markets)))();
    if (url.pathname === '/api/v1/ticker') return (over.ticker ?? (() => Response.json({ ...ticker, symbol: url.searchParams.get('symbol') })))();
    return new Response('unexpected', { status: 500 });
  });

  it('compares a listed underlying against the venue tape and skips unlisted assets without a venue call', async () => {
    const fetch = fetcher(); vi.stubGlobal('fetch', fetch);
    const response = await post({ items: [{ mint: MU, usdcRaw: '100000000', units: '0.0917' }, { mint: AAPL, usdcRaw: '100000000', units: '0.3' }] });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.state).toBe('success');
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ mint: MU, symbol: 'MUx', underlying: 'MU', venue: 'backpack', venueSymbol: 'MU.US_USDC', venueLastPrice: '1089.74', venueTrades: 12, thin: true, impliedUsdcPerUnit: '1090.512540', differenceBps: '7', tradeUrl: 'https://backpack.exchange/trade/MU.US_USDC' });
    expect(Date.parse(body.items[0].expiresAt) - Date.parse(body.items[0].fetchedAt)).toBe(30_000);
    const paths = fetch.mock.calls.map(([input]) => new URL(String(input)).pathname);
    expect(paths).toEqual(['/api/v1/markets', '/api/v1/ticker']);
    expect(fetch.mock.calls.every(call => !JSON.stringify(call[1]?.headers ?? {}).match(/api-key|signature/i))).toBe(true);
  });
  it('answers success with no items when nothing selected is listed, and never reads a ticker', async () => {
    const fetch = fetcher(); vi.stubGlobal('fetch', fetch);
    const body = await (await post({ items: [{ mint: AAPL, usdcRaw: '100000000', units: '0.3' }] })).json();
    expect(body).toMatchObject({ state: 'success', items: [] });
    expect(fetch.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual(['/api/v1/markets']);
  });
  it('rejects malformed requests before any venue call and reports an unverified venue as unavailable', async () => {
    const fetch = fetcher(); vi.stubGlobal('fetch', fetch);
    for (const body of [{ items: [] }, { items: [{ mint: 'bad', usdcRaw: '1', units: '1' }] }, { items: [{ mint: MU, usdcRaw: '1', units: '1' }, { mint: MU, usdcRaw: '1', units: '1' }] }, { items: [{ mint: MU, usdcRaw: '1', units: '1', extra: true }] }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubGlobal('fetch', fetcher({ ticker: () => Response.json({ ...ticker, lastPrice: 'garbage' }) }));
    const broken = await post({ items: [{ mint: MU, usdcRaw: '100000000', units: '0.0917' }] });
    expect(broken.status).toBe(503);
    expect((await broken.json()).state).toBe('unavailable');
  });
});
