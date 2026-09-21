import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESTOCK_ISSUER_URL, PRESTOCK_REGISTRY } from '../lib/domain/prestocks';
import fixture from '../docs/releases/2026-09-21/prestocks-official-fixture.json';

const state = vi.hoisted(() => ({ paused: false, wrongMetadata: false, chainUnavailable: false, coordinationDelay: 0, balanceUnavailable: false }));
const ASSET = PRESTOCK_REGISTRY.find(asset => asset.symbol === 'OPENAI')!;
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const OWNER = '11111111111111111111111111111111';
const info = { decimals: 9, tokenProgram: PROGRAM, scaled: true, transferBlockedReasons: ['TransferFeeConfig', 'ConfidentialTransferFee'] };
vi.mock('../lib/server/solana', () => ({
  rpcConfigured: () => Boolean(process.env.SOLANA_RPC_URL),
  loadMints: async (mints: string[]) => new Map(mints.map(mint => [mint, state.chainUnavailable ? new Error('chain unavailable') : info])),
  loadMintSnapshot: async (mint: string, fresh: boolean) => {
    expect(fresh).toBe(true);
    if (state.chainUnavailable) throw new Error('chain unavailable');
    const identity = PRESTOCK_REGISTRY.find(asset => asset.mint === mint)!;
    return { info, slot: 123, mint: { extensions: { __option: 'Some', value: [
      { __kind: 'PausableConfig', paused: state.paused },
      { __kind: 'TokenMetadata', mint: state.wrongMetadata ? USDC : mint, name: identity.name, symbol: identity.symbol, uri: identity.metadataUrl },
    ] } } };
  },
  convertRawUnitsWithContext: async () => ({ units: '0.008941576', context: { source: 'clock-sysvar', kind: 'scaled', decimals: 9, tokenProgram: PROGRAM, mintSlot: 123, clockSlot: 123, unixTimestamp: '1789930000', multiplier: 1.4861347, observedAt: new Date().toISOString() } }),
  convertRawUnitsBatch: async (entries: { mint: string; raw: string }[]) => new Map(entries.map(entry => [entry.mint, { units: '0.008941576', context: { source: 'clock-sysvar', kind: 'scaled', decimals: 9, tokenProgram: PROGRAM, mintSlot: 123, clockSlot: 123, unixTimestamp: '1789930000', multiplier: 1.4861347, observedAt: new Date().toISOString() } }])),
  loadRawBalanceWithContext: async (_owner: string, mint: string) => {
    if (state.balanceUnavailable && mint !== USDC) {
      const { ServiceError } = await import('../lib/server/common');
      throw new ServiceError('unavailable', 'A token account has unsupported balance extensions. The complete balance is unavailable.');
    }
    return { raw: '10', frozenRaw: '0', slot: 123, accountCount: 1 };
  },
}));
vi.mock('../lib/server/provider-limits', () => ({ reserveProviderSlot: async () => { if (state.coordinationDelay) vi.setSystemTime(Date.now() + state.coordinationDelay); } }));

beforeEach(() => {
  vi.resetModules(); Object.assign(state, { paused: false, wrongMetadata: false, chainUnavailable: false, coordinationDelay: 0, balanceUnavailable: false });
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test'); vi.stubEnv('JUPITER_API_KEY', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
function upstream(rows: unknown = fixture.rows) {
  const fetcher = vi.fn(async (input: string) => {
    if (input === PRESTOCK_ISSUER_URL) return Response.json(rows);
    const params = new URL(input).searchParams;
    return Response.json({ inputMint: USDC, outputMint: params.get('outputMint'), inAmount: params.get('amount'), outAmount: '6016666', transaction: null, router: 'metis' });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('pinned PreStocks identities', () => {
  it('loads only the eight verified issuer identities and preserves unknown halt status', async () => {
    const fetcher = upstream();
    const { getPreStocksCatalog } = await import('../lib/server/prestocks');
    const [catalog, shared] = await Promise.all([getPreStocksCatalog(), getPreStocksCatalog()]);
    expect(shared).toBe(catalog); expect(catalog.state).toBe('success'); expect(catalog.assets).toHaveLength(8);
    for (const asset of catalog.assets) expect(asset).toMatchObject({ halted: null, issuerId: 'prestocks', instrumentId: `prestocks:solana:${asset.mint}`, issuerSourceUrl: PRESTOCK_ISSUER_URL, decimals: 9 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await getPreStocksCatalog()).toBe(catalog);
  });
  it('rejects changed deployment, identity, URLs, duplicate mints and duplicate symbols', async () => {
    const { parsePreStocksIssuerCatalog } = await import('../lib/server/prestocks');
    const row = fixture.rows[0];
    for (const change of [{ contract_address: USDC }, { name: 'A different company' }, { image: 'https://untrusted.example/logo.png' }, { external_url: 'https://untrusted.example' }]) {
      expect(parsePreStocksIssuerCatalog([{ ...row, ...change }]).get(row.symbol)).toBeInstanceOf(Error);
    }
    expect(parsePreStocksIssuerCatalog([row, row]).get(row.symbol)).toBeInstanceOf(Error);
    expect(parsePreStocksIssuerCatalog([row, { ...row, symbol: 'UNPINNED' }]).get(row.symbol)).toBeInstanceOf(Error);
    expect(() => parsePreStocksIssuerCatalog(Array(101).fill(row))).toThrow('could not be verified');
  });
  it('does not accept newly listed or non-PreStocks mints without review', async () => {
    upstream([...fixture.rows, { ...fixture.rows[0], symbol: 'UNPINNED', contract_address: USDC }]);
    const { getPreStocksCatalog, selectedPreStocksAssets } = await import('../lib/server/prestocks');
    expect((await getPreStocksCatalog()).assets).toHaveLength(8);
    await expect(selectedPreStocksAssets([USDC])).rejects.toThrow('verified PreStocks');
  });
  it('provides partial results for missing or ambiguous assets without synthetic fallback', async () => {
    upstream([fixture.rows[0], fixture.rows[0], fixture.rows[1]]);
    const { getPreStocksCatalog } = await import('../lib/server/prestocks');
    const catalog = await getPreStocksCatalog();
    expect(catalog.state).toBe('partial'); expect(catalog.assets.map(asset => asset.symbol)).toEqual(['ANTHROPIC']);
    expect(catalog.unavailable).toHaveLength(7);
  });
  it('reports missing RPC configuration before contacting a provider', async () => {
    vi.stubEnv('SOLANA_RPC_URL', ''); const fetcher = upstream();
    const { getPreStocksCatalog } = await import('../lib/server/prestocks');
    expect((await getPreStocksCatalog()).state).toBe('configuration-required'); expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('PreStocks read-only planning', () => {
  it('requests a quote without taker or transaction and uses verified mint scaling', async () => {
    const fetcher = upstream();
    const { getPreStocksQuotes } = await import('../lib/server/prestocks');
    const result = await getPreStocksQuotes([{ mint: ASSET.mint, usdcRaw: '10000000' }]);
    expect(result.quotes[0]).toMatchObject({ state: 'success', outRaw: '6016666', units: '0.008941576', unitContext: { multiplier: 1.4861347 } });
    const request = fetcher.mock.calls.map(([url]) => new URL(url)).find(url => url.hostname === 'api.jup.ag')!;
    expect(request.pathname).toBe('/swap/v2/order');
    expect([...request.searchParams.keys()].sort()).toEqual(['amount', 'inputMint', 'outputMint']);
    expect((await getPreStocksQuotes([{ mint: ASSET.mint, usdcRaw: '10000000' }])).quotes[0].fetchedAt).toBe(result.quotes[0].fetchedAt);
    expect(fetcher.mock.calls.filter(([url]) => url.startsWith('https://api.jup.ag'))).toHaveLength(1);
  });
  it.each(['paused', 'wrongMetadata', 'chainUnavailable'] as const)('fails closed before Jupiter for %s', async kind => {
    const fetcher = upstream();
    const { getPreStocksCatalog, getPreStocksQuotes } = await import('../lib/server/prestocks');
    await getPreStocksCatalog(); state[kind] = true;
    const result = await getPreStocksQuotes([{ mint: ASSET.mint, usdcRaw: '10000000' }]);
    expect(result.quotes[0]).toMatchObject({ state: 'unavailable', units: null, outRaw: null });
    expect(fetcher.mock.calls.some(([url]) => url.startsWith('https://api.jup.ag'))).toBe(false);
  });
  it('rechecks issuer identity after the short issuer observation expires', async () => {
    vi.useFakeTimers(); const fetcher = upstream();
    const { getPreStocksCatalog, getPreStocksQuotes } = await import('../lib/server/prestocks');
    await getPreStocksCatalog(); vi.setSystemTime(Date.now() + 16_000);
    fetcher.mockImplementation(async () => Response.json(fixture.rows.filter(row => row.symbol !== ASSET.symbol)));
    const result = await getPreStocksQuotes([{ mint: ASSET.mint, usdcRaw: '10000000' }]);
    expect(result.quotes[0].state).toBe('unavailable');
    expect(fetcher.mock.calls.some(([url]) => url.startsWith('https://api.jup.ag'))).toBe(false);
  });
  it('rejects verification that becomes stale during provider coordination', async () => {
    vi.useFakeTimers(); state.coordinationDelay = 30_000; const fetcher = upstream();
    const { getPreStocksQuotes } = await import('../lib/server/prestocks');
    const result = await getPreStocksQuotes([{ mint: ASSET.mint, usdcRaw: '10000000' }]);
    expect(result.quotes[0].reasonCode).toBe('stale-verification');
    expect(fetcher.mock.calls.some(([url]) => url.startsWith('https://api.jup.ag'))).toBe(false);
  });
  it('shares the same spaced Jupiter queue with other issuer adapters', async () => {
    vi.useFakeTimers(); const starts: number[] = []; const fetcher = upstream();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async input => { if (input.startsWith('https://api.jup.ag')) starts.push(Date.now()); return original(input); });
    const { getPreStocksQuotes } = await import('../lib/server/prestocks');
    const { getReadOnlyQuote } = await import('../lib/server/quotes');
    const one = getReadOnlyQuote(USDC, '10000000', async () => ({ fetchedAt: new Date().toISOString() }));
    const two = getPreStocksQuotes([{ mint: ASSET.mint, usdcRaw: '10000000' }]);
    await vi.advanceTimersByTimeAsync(5_000); await Promise.all([one, two]);
    expect(starts).toHaveLength(2); expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2100);
  });
  it('keeps unsupported transfer-fee account balances unavailable instead of zero', async () => {
    upstream(); state.balanceUnavailable = true;
    const { getPreStocksHoldings } = await import('../lib/server/prestocks');
    const result = await getPreStocksHoldings(OWNER, [ASSET.mint]);
    expect(result.state).toBe('partial'); expect(result.holdings[0]).toMatchObject({ state: 'unavailable', raw: null, units: null });
    expect(result.holdings[0].message).toContain('unsupported balance extensions');
  });
  it('rejects wrong-universe and malformed route requests without provider calls', async () => {
    const fetcher = upstream(); const { POST } = await import('../app/api/prestocks/quotes/route');
    for (const item of [{ mint: USDC, usdcRaw: '10000000' }, { mint: ASSET.mint, usdcRaw: '1.2' }]) {
      const response = await POST(new Request('http://localhost/api/prestocks/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) }));
      expect(response.status).toBe(400); expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
