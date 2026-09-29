import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CRYPTO_REGISTRY, SPL_TOKEN_PROGRAM, WRAPPED_SOL_MINT } from '../lib/domain/crypto-assets';
import type { CatalogResponse } from '../lib/domain/types';

const chain = vi.hoisted(() => ({ native: 0n, nativeReads: 0 }));
vi.mock('../lib/server/solana', () => ({
  rpcConfigured: () => true,
  loadMints: async () => new Map(),
  loadRawBalanceWithContext: async () => ({ raw: '500000000', slot: 5, frozenRaw: '0' }),
  loadNativeLamports: async () => { chain.nativeReads += 1; return chain.native; },
  convertRawUnitsBatch: async (entries: { mint: string; raw: string }[]) => new Map(entries.map(entry => [entry.mint, { units: entry.raw, context: { source: 'mint', kind: 'standard', decimals: 9, tokenProgram: SPL_TOKEN_PROGRAM, observedAt: new Date().toISOString() } }])),
  convertRawUnitsWithContext: async () => { throw new Error('not used'); },
}));

const pinned = (overrides: Record<string, { decimals?: number; tokenProgram?: string } | Error> = {}) => async (mints: readonly string[]) => {
  const { ServiceError } = await import('../lib/server/common');
  return new Map<string, unknown>(mints.map((mint): [string, unknown] => {
    const asset = CRYPTO_REGISTRY.find(item => item.mint === mint)!;
    const override = overrides[asset.symbol];
    if (override instanceof Error) return [mint, new ServiceError('unavailable', override.message)];
    return [mint, { decimals: override?.decimals ?? asset.decimals, tokenProgram: override?.tokenProgram ?? SPL_TOKEN_PROGRAM }];
  })) as never;
};

beforeEach(() => { vi.resetModules(); chain.native = 0n; chain.nativeReads = 0; });

describe('crypto catalog', () => {
  it('lists a pinned token only while the chain still matches its decimals and program', async () => {
    const { cryptoCatalog } = await import('../lib/server/catalog');
    const result = await cryptoCatalog(pinned({ cbBTC: { decimals: 9 }, ETH: new Error('The chain account could not be verified.'), mSOL: { tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' } }));
    expect(result.assets.map(asset => asset.symbol)).toEqual(['SOL', 'WBTC', 'JitoSOL', 'JupSOL', 'INF']);
    expect(result.unavailable).toEqual([
      { symbol: 'cbBTC', message: 'This mint no longer matches its pinned identity and needs review.' },
      { symbol: 'ETH', message: 'The chain account could not be verified.' },
      { symbol: 'mSOL', message: 'This mint no longer matches its pinned identity and needs review.' },
    ]);
    expect(result.assets[0]).toMatchObject({ symbol: 'SOL', mint: WRAPPED_SOL_MINT, decimals: 9, tokenProgram: SPL_TOKEN_PROGRAM, halted: false, logoUrl: '/logos/crypto/SOL.png', underlyingSymbol: 'SOL' });
  });

  it('marks every token unavailable when the chain cannot be read, instead of trusting the pins', async () => {
    const { cryptoCatalog } = await import('../lib/server/catalog');
    const result = await cryptoCatalog(async () => { throw new Error('RPC down'); });
    expect(result.assets).toEqual([]);
    expect(result.unavailable).toHaveLength(8);
  });

  it('reports the combined state of stocks and crypto', async () => {
    const { withCrypto } = await import('../lib/server/catalog');
    const stock = { symbol: 'AAPLx', name: 'Apple xStock', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', decimals: 8, tokenProgram: SPL_TOKEN_PROGRAM, halted: false, verifiedAt: new Date().toISOString() };
    const stocks: CatalogResponse = { state: 'success', assets: [stock], unavailable: [] };
    const allCrypto = await (await import('../lib/server/catalog')).cryptoCatalog(pinned());
    expect(withCrypto(stocks, allCrypto)).toMatchObject({ state: 'success', assets: { length: 9 } });
    expect(withCrypto(stocks, { assets: [], unavailable: [{ symbol: 'SOL', message: 'x' }] })).toMatchObject({ state: 'partial', message: 'Some assets are temporarily unavailable.' });
    const configuration: CatalogResponse = { state: 'configuration-required', assets: [], unavailable: [], message: 'Live needs SOLANA_RPC_URL on the server.' };
    expect(withCrypto(configuration, allCrypto)).toBe(configuration);
    expect(withCrypto({ state: 'unavailable', assets: [], unavailable: [{ symbol: 'AAPLx', message: 'x' }], message: 'Issuer down.' }, allCrypto)).toMatchObject({ state: 'partial', message: 'Issuer down.' });
  });
});

describe('crypto holdings', () => {
  it('counts native SOL with wrapped SOL, and reads lamports for SOL only', async () => {
    chain.native = 1_500_000_000n;
    const { getHoldingsForVerifiedAssets } = await import('../lib/server/holdings');
    const assets = (await (await import('../lib/server/catalog')).cryptoCatalog(pinned())).assets;
    const owner = '11111111111111111111111111111111';
    const result = await getHoldingsForVerifiedAssets(owner, assets.filter(asset => ['SOL', 'cbBTC'].includes(asset.symbol)));
    expect(result.holdings.find(holding => holding.mint === WRAPPED_SOL_MINT)).toMatchObject({ raw: '2000000000' });
    expect(result.holdings.find(holding => holding.mint === 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij')).toMatchObject({ raw: '500000000' });
    expect(chain.nativeReads).toBe(1);
  });
});

describe('plans holding crypto', () => {
  it('save and share with the pinned crypto, never with an unlisted mint', async () => {
    const { cloudPlanInput } = await import('../lib/supabase/plans');
    const { galleryPlanSchema } = await import('../lib/domain/gallery');
    const split = (mint: string) => [{ mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', bps: '6000' }, { mint, bps: '4000' }];
    expect(cloudPlanInput.safeParse({ name: 'Mixed', budget_raw: '250000000', allocations: split(WRAPPED_SOL_MINT) }).success).toBe(true);
    expect(cloudPlanInput.safeParse({ name: 'Mixed', budget_raw: '250000000', allocations: split('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') }).success).toBe(false);
    const shared = { id: '6a1f8c4e-2b7d-4c1e-9f0a-3d5b7e9c1a2b', name: 'Mixed', display_name: null, copy_count: 0, published_at: '2026-09-29T00:00:00.000Z', allocations: split('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn') };
    expect(galleryPlanSchema.safeParse(shared).success).toBe(true);
  });
});
