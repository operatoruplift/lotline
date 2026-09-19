import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { address } from '@solana/kit';
import { getMintEncoder } from '@solana-program/token-2022';
import { XSTOCK_REGISTRY } from '../lib/domain/assets';
import { MAINNET_GENESIS_HASH } from '../lib/server/solana-network';

const PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const OWNER = '11111111111111111111111111111111';
const encodedMint = getMintEncoder().encode({ mintAuthority: null, supply: 1_000_000_000n, decimals: 8, isInitialized: true, freezeAuthority: null, extensions: [{ __kind: 'ScaledUiAmountConfig', authority: address(OWNER), multiplier: 1.25, newMultiplier: 1.5, newMultiplierEffectiveTimestamp: 2_000n }] });
const validAccount = () => ({ owner: PROGRAM, executable: false, lamports: 100, data: [Buffer.from(encodedMint).toString('base64'), 'base64'] });
const issuer = (index: number) => {
  const asset = XSTOCK_REGISTRY[index];
  return { symbol: asset.symbol, name: asset.name, isin: asset.issuerIsin, underlying: { symbol: asset.underlyingSymbol, isin: asset.underlyingIsin }, logo: asset.logoSourceUrl, isTradingHalted: false, trading: null, deployments: [{ network: 'Solana', address: asset.mint }] };
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('LOTLINE_SHARED_LIMITS', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('verified large issuer catalog', () => {
  it('rejects changed deployments and resolves the current underlying schema', async () => {
    const { parseIssuerAsset } = await import('../lib/server/catalog');
    expect(parseIssuerAsset(issuer(0), 'AAPLx')).toMatchObject({ underlyingSymbol: 'AAPL', underlyingIsin: 'US0378331005' });
    expect(() => parseIssuerAsset({ ...issuer(0), deployments: [{ network: 'Solana', address: XSTOCK_REGISTRY[1].mint }] }, 'AAPLx')).toThrow('changed');
  });

  it('rejects wrong page indexes and truncated continuing pages', async () => {
    const { parseIssuerPage } = await import('../lib/server/catalog');
    expect(() => parseIssuerPage({ nodes: [], page: { currentPage: 1, hasNextPage: false } }, 0)).toThrow();
    expect(() => parseIssuerPage({ nodes: [issuer(0)], page: { currentPage: 0, hasNextPage: true } }, 0)).toThrow();
    expect(parseIssuerPage({ nodes: [issuer(0)], page: { currentPage: 0, hasNextPage: false } }, 0).nodes).toHaveLength(1);
  });

  it('loads every page, verifies chain accounts in batches and reuses cached catalogs', async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.startsWith('https://api.xstocks.fi/')) {
        if (new URL(input).pathname.endsWith('/AAPLx')) return Response.json({ ...issuer(0), isTradingHalted: true });
        const page = Number(new URL(input).searchParams.get('page'));
        return Response.json({ nodes: XSTOCK_REGISTRY.slice(page * 100, (page + 1) * 100).map((_, index) => issuer(page * 100 + index)), page: { currentPage: page, hasNextPage: (page + 1) * 100 < XSTOCK_REGISTRY.length } });
      }
      const body = JSON.parse(init!.body as string);
      if (body.method === 'getGenesisHash') return Response.json({ result: MAINNET_GENESIS_HASH });
      expect(body.method).toBe('getMultipleAccounts');
      expect(body.params[0].length).toBeLessThanOrEqual(100);
      return Response.json({ result: { context: { slot: 123 }, value: body.params[0].map(validAccount) } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getCatalog, getIssuerAsset } = await import('../lib/server/catalog');
    const [first, shared] = await Promise.all([getCatalog(), getCatalog()]);
    expect(first).toBe(shared);
    expect(first.state).toBe('success');
    expect(first.assets).toHaveLength(XSTOCK_REGISTRY.length);
    expect(first.assets.map(asset => asset.mint)).toEqual(XSTOCK_REGISTRY.map(asset => asset.mint));
    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(XSTOCK_REGISTRY.length / 100) * 2 + 1);
    expect(await getCatalog()).toBe(first);
    expect(await getIssuerAsset('AAPLx')).toMatchObject({ mint: XSTOCK_REGISTRY[0].mint, halted: true });
    expect(await getIssuerAsset('AAPLx')).toMatchObject({ halted: true });
    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(XSTOCK_REGISTRY.length / 100) * 2 + 2);
  }, 60_000);

  it('does not let duplicate issuer symbols pick a winner', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      if (input.startsWith('https://api.xstocks.fi/')) return Response.json({ nodes: [issuer(0), issuer(0), issuer(1)], page: { currentPage: 0, hasNextPage: false } });
      const body = JSON.parse(init!.body as string);
      if (body.method === 'getGenesisHash') return Response.json({ result: MAINNET_GENESIS_HASH });
      return Response.json({ result: { context: { slot: 123 }, value: body.params[0].map(validAccount) } });
    }));
    const { getCatalog } = await import('../lib/server/catalog');
    const result = await getCatalog();
    expect(result.state).toBe('partial');
    expect(result.assets.map(asset => asset.symbol)).toEqual(['MSFTx']);
    expect(result.unavailable.find(asset => asset.symbol === 'AAPLx')?.message).toContain('ambiguous');
  });
});

describe('batched on-chain mint verification', () => {
  it('keeps account ordering and isolates invalid or absent accounts', async () => {
    const mints = XSTOCK_REGISTRY.slice(0, 201).map(asset => asset.mint);
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      if (body.method === 'getGenesisHash') return Response.json({ result: MAINNET_GENESIS_HASH });
      return Response.json({ result: { context: { slot: 1 }, value: body.params[0].map((mint: string) => mint === mints[1] ? null : mint === mints[100] ? { ...validAccount(), owner: OWNER } : validAccount()) } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { loadMints } = await import('../lib/server/solana');
    const result = await loadMints(mints);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.size).toBe(201);
    expect(result.get(mints[0])).toMatchObject({ decimals: 8, tokenProgram: PROGRAM, scaled: true });
    expect(result.get(mints[1])).toBeInstanceOf(Error);
    expect(result.get(mints[100])).toBeInstanceOf(Error);
    expect(result.get(mints[200])).toMatchObject({ decimals: 8 });
    await loadMints([mints[0], mints[200]]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects truncated RPC responses instead of matching accounts to wrong mints', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => Response.json({ result: JSON.parse(init!.body as string).method === 'getGenesisHash' ? MAINNET_GENESIS_HASH : { context: { slot: 1 }, value: [validAccount()] } })));
    const { loadMints } = await import('../lib/server/solana');
    const mints = XSTOCK_REGISTRY.slice(0, 2).map(asset => asset.mint);
    const result = await loadMints(mints);
    for (const mint of mints) expect(result.get(mint)).toBeInstanceOf(Error);
    await expect(loadMints([mints[0], mints[0]])).rejects.toThrow('invalid');
    await expect(loadMints(['not-an-address'])).rejects.toThrow('invalid');
  });
});
