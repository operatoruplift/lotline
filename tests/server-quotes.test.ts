import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ halted: false, oldHalt: false }));
const MINT = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
vi.mock('../lib/server/catalog', () => ({
  selectedAssets: async () => [{ symbol: 'AAPLx', mint: MINT, halted: state.oldHalt }],
  getIssuerAsset: async () => ({ symbol: 'AAPLx', mint: MINT, halted: state.halted }),
}));
vi.mock('../lib/server/solana', () => ({ convertRawUnits: async () => '0.0297791' }));
const payload = { inputMint: USDC, outputMint: MINT, inAmount: '10000000', outAmount: '2968207', transaction: null, router: 'metis' };
beforeEach(() => { vi.resetModules(); state.halted = false; state.oldHalt = false; vi.stubEnv('JUPITER_API_KEY', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('makes a real-shaped quote-only request without key, wallet or taker', async () => {
  const fetcher = vi.fn(async () => Response.json(payload)); vi.stubGlobal('fetch', fetcher);
  const { getQuotes } = await import('../lib/server/quotes');
  expect((await getQuotes([{ mint: MINT, usdcRaw: '10000000' }])).state).toBe('success');
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url).origin + new URL(url).pathname).toBe('https://api.jup.ag/swap/v2/order');
  expect([...new URL(url).searchParams.keys()].sort()).toEqual(['amount', 'inputMint', 'outputMint']);
  expect(init.headers).toEqual({});
});
it('retains original retrieval time when an identical quote is briefly cached', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json(payload)); vi.stubGlobal('fetch', fetcher);
  const { getQuotes } = await import('../lib/server/quotes');
  const first = await getQuotes([{ mint: MINT, usdcRaw: '10000000' }]);
  await vi.advanceTimersByTimeAsync(4000);
  const second = await getQuotes([{ mint: MINT, usdcRaw: '10000000' }]);
  expect(second.quotes[0].fetchedAt).toBe(first.quotes[0].fetchedAt); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('halts fresh estimates on current issuer information and allows resumed assets', async () => {
  const fetcher = vi.fn(async () => Response.json(payload)); vi.stubGlobal('fetch', fetcher);
  let { getQuotes } = await import('../lib/server/quotes');
  state.halted = true;
  expect((await getQuotes([{ mint: MINT, usdcRaw: '10000000' }])).quotes[0].message).toContain('halt');
  expect(fetcher).not.toHaveBeenCalled();
  vi.resetModules(); state.halted = false; state.oldHalt = true;
  ({ getQuotes } = await import('../lib/server/quotes'));
  expect((await getQuotes([{ mint: MINT, usdcRaw: '10000000' }])).state).toBe('success');
});
it('skips zero allocations and surfaces route failures without sample fallback', async () => {
  const fetcher = vi.fn(async () => new Response('no route', { status: 503 })); vi.stubGlobal('fetch', fetcher);
  const { getQuotes } = await import('../lib/server/quotes');
  expect((await getQuotes([{ mint: MINT, usdcRaw: '0' }])).quotes).toEqual([]); expect(fetcher).not.toHaveBeenCalled();
  const failed = await getQuotes([{ mint: MINT, usdcRaw: '10000000' }]);
  expect(failed.state).toBe('unavailable'); expect(failed.quotes[0]).toMatchObject({ units: null, outRaw: null, state: 'unavailable' });
});
it('returns invalid-input 400 for malformed money and bounds JSON bodies', async () => {
  const { POST } = await import('../app/api/quotes/route');
  for (const amount of ['oops', '1.2', '', '1e6']) {
    const result = await POST(new Request('http://localhost/api/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ mint: MINT, usdcRaw: amount }] }) }));
    expect(result.status).toBe(400); expect((await result.json()).state).toBe('invalid-input');
  }
  const oversized = await POST(new Request('http://localhost/api/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'a'.repeat(5000) }) }));
  expect(oversized.status).toBe(400);
});
