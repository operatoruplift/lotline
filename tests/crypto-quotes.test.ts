import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const SOL = 'So11111111111111111111111111111111111111112';
const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const issuer = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../lib/server/catalog', () => ({
  selectedAssets: async (mints: string[]) => mints.map(mint => mint === SOL ? { symbol: 'SOL', mint: SOL, halted: false } : { symbol: 'AAPLx', mint: AAPLX, halted: false }),
  getIssuerAsset: async (symbol: string) => { issuer.calls.push(symbol); return { symbol, mint: AAPLX, halted: false, fetchedAt: new Date().toISOString() }; },
}));
vi.mock('../lib/server/provider-limits', () => ({ reserveProviderSlot: async () => undefined }));
vi.mock('../lib/server/solana', () => ({ convertRawUnitsWithContext: async () => ({ units: '0.08', context: { source: 'mint', kind: 'standard', decimals: 9, tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', observedAt: new Date().toISOString() } }) }));

beforeEach(() => { vi.resetModules(); issuer.calls = []; vi.stubEnv('JUPITER_API_KEY', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('quotes crypto without an issuer check, which it does not have, and still checks stocks', async () => {
  const fetcher = vi.fn(async (url: string) => {
    const outputMint = new URL(url).searchParams.get('outputMint');
    return Response.json({ inputMint: USDC, outputMint, inAmount: '10000000', outAmount: outputMint === SOL ? '83000000' : '2968207', transaction: null, router: 'metis' });
  });
  vi.stubGlobal('fetch', fetcher);
  const { getQuotes } = await import('../lib/server/quotes');
  const crypto = await getQuotes([{ mint: SOL, usdcRaw: '10000000' }]);
  expect(crypto.state).toBe('success');
  expect(crypto.quotes[0]).toMatchObject({ mint: SOL, state: 'success', outRaw: '83000000', units: '0.08' });
  expect(issuer.calls).toEqual([]);
  await getQuotes([{ mint: AAPLX, usdcRaw: '10000000' }]);
  expect(issuer.calls).toEqual(['AAPLx']);
});
