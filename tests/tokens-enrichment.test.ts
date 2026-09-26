import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { XSTOCK_MINTS } from '../lib/domain/assets';

const MINT = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const OTHER_MINT = 'XvdWdv7KfP5GksBy3wpXr7FFGRxRuQ8M7dxwUQWBDki';
const NOW = Date.UTC(2026, 8, 12, 12);
const verification = vi.hoisted(() => ({ available: true, hang: false }));
vi.mock('../lib/server/catalog', () => ({
  selectedAssets: vi.fn(async (mints: string[]) => {
    if (!verification.available) throw new Error('Verification unavailable');
    if (verification.hang) await new Promise(() => undefined);
    return mints.map(mint => ({ mint, symbol: 'AAPLx' }));
  }),
}));

/** Synthetic contract fixture only. These numbers are never shipped as live data. */
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    asset: {
      assetId: 'apple', name: 'Apple', category: 'equity',
      stats: { liquidity: 999_999_999, price: 999 },
      primaryVariant: { mint: OTHER_MINT, market: { liquidity: 777_777 } },
      variantGroups: {
        tokenizedEquity: [{
          variantId: 'apple:aaplx', mint: MINT, kind: 'tokenized_equity',
          name: 'Apple xStock', issuer: 'Backed', advisory: null,
          market: { liquidity: 1234.5, lastFetchedAt: NOW - 30_000, asOf: NOW - 45_000 },
          ...overrides,
        }],
      },
    },
    resolution: { assetId: 'apple', mint: MINT, ref: `solana-${MINT}` },
  };
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv('TOKENS_XYZ_ENABLED', 'true'); vi.stubEnv('TOKENS_XYZ_API_KEY', 'unit-test-secret');
  verification.available = true; verification.hang = false;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('exact-mint optional Tokens enrichment', () => {
  it('uses only the verified Solana variant, never canonical or primary-variant metrics', async () => {
    const fetcher = vi.fn(async () => Response.json(fixture())); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const result = await getAssetDetails('solana', MINT);
    expect(result).toMatchObject({ state: 'success', mint: MINT, source: 'tokens.xyz', details: {
      canonicalName: 'Apple', representation: 'Apple xStock', issuer: 'Backed', liquidityUsd: 1234.5,
      snapshotFetchedAt: new Date(NOW - 30_000).toISOString(), activityAsOf: new Date(NOW - 45_000).toISOString(),
      sourceUrl: `https://tokens.xyz/apple?solana=${MINT}`,
    } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.tokens.xyz/v1/assets/solana-${MINT}?mint=${MINT}`);
    expect(init).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { 'x-api-key': 'unit-test-secret' } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(result)).not.toContain('unit-test-secret');
    expect(JSON.stringify(result)).not.toContain('999999999');
    expect(JSON.stringify(result)).not.toContain('price');
    const { assetDetailsResponseSchema } = await import('../lib/domain/enrichment');
    expect(assetDetailsResponseSchema.safeParse(result).success).toBe(true);
    expect(assetDetailsResponseSchema.safeParse({ ...result, details: { ...result.details, sourceUrl: 'https://example.com' } }).success).toBe(false);
  });

  it.each([
    ['different mint', { mint: OTHER_MINT }],
    ['different network', { chain: 'ethereum' }],
    ['malformed liquidity', { market: { liquidity: -1, lastFetchedAt: NOW } }],
    ['malformed timestamp', { market: { liquidity: 1, lastFetchedAt: 'now' } }],
  ])('rejects %s without a synthetic fallback', async (_label, overrides) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fixture(overrides))));
    const { getAssetDetails } = await import('../lib/server/tokens');
    expect(await getAssetDetails('solana', MINT)).toMatchObject({ state: 'unavailable', details: null });
  });

  it('rejects duplicate exact-mint variants and a contradictory resolution', async () => {
    const payload = fixture();
    payload.asset.variantGroups.tokenizedEquity.push(payload.asset.variantGroups.tokenizedEquity[0]);
    const fetcher = vi.fn(async () => Response.json(payload)); vi.stubGlobal('fetch', fetcher);
    let adapter = await import('../lib/server/tokens');
    expect((await adapter.getAssetDetails('solana', MINT)).state).toBe('unavailable');
    vi.resetModules(); const mismatched = fixture(); mismatched.resolution.mint = OTHER_MINT;
    fetcher.mockImplementation(async () => Response.json(mismatched));
    adapter = await import('../lib/server/tokens');
    expect((await adapter.getAssetDetails('solana', MINT)).state).toBe('unavailable');
  });

  it('keeps missing market fields unavailable and preserves an explicit zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fixture({ market: null }))));
    let { getAssetDetails } = await import('../lib/server/tokens');
    const missing = await getAssetDetails('solana', MINT);
    expect(missing.state).toBe('partial'); expect(missing.details).not.toHaveProperty('liquidityUsd');
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fixture({ market: { liquidity: 0, lastFetchedAt: NOW } }))));
    ({ getAssetDetails } = await import('../lib/server/tokens'));
    expect((await getAssetDetails('solana', MINT)).details?.liquidityUsd).toBe(0);
  });

  it.each([
    ['missing', undefined], ['future', NOW + 120_000], ['stale', NOW - 901_000],
  ])('omits liquidity with a %s provider snapshot timestamp', async (label, timestamp) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fixture({ market: { liquidity: 1234.5, lastFetchedAt: timestamp } }))));
    const { getAssetDetails } = await import('../lib/server/tokens');
    const result = await getAssetDetails('solana', MINT);
    expect(result.state).toBe(label === 'stale' ? 'stale' : 'partial');
    expect(result.details).not.toHaveProperty('liquidityUsd');
  });

  it('does not renew provider timestamps through server caching', async () => {
    const fetcher = vi.fn(async () => Response.json(fixture())); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const first = await getAssetDetails('solana', MINT);
    vi.setSystemTime(NOW + 30_000);
    const second = await getAssetDetails('solana', MINT);
    expect(second.details?.snapshotFetchedAt).toBe(first.details?.snapshotFetchedAt);
    expect(second.details?.activityAsOf).toBe(first.details?.activityAsOf);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('removes cached liquidity as its original snapshot becomes stale', async () => {
    const fetcher = vi.fn(async () => Response.json(fixture({ market: { liquidity: 1234, lastFetchedAt: NOW - 890_000 } })));
    vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    expect((await getAssetDetails('solana', MINT)).details?.liquidityUsd).toBe(1234);
    vi.setSystemTime(NOW + 20_000);
    const later = await getAssetDetails('solana', MINT);
    expect(later.state).toBe('stale'); expect(later.details).not.toHaveProperty('liquidityUsd');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('requires explicit enablement, credentials, allowlisting and current catalog verification', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    vi.stubEnv('TOKENS_XYZ_ENABLED', 'false');
    expect((await getAssetDetails('solana', MINT)).state).toBe('configuration-required');
    vi.stubEnv('TOKENS_XYZ_ENABLED', 'true'); vi.stubEnv('TOKENS_XYZ_API_KEY', '');
    expect((await getAssetDetails('solana', MINT)).state).toBe('configuration-required');
    vi.stubEnv('TOKENS_XYZ_API_KEY', 'unit-test-secret');
    expect((await getAssetDetails('ethereum', MINT)).state).toBe('invalid-input');
    expect((await getAssetDetails('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).state).toBe('invalid-input');
    verification.available = false;
    expect((await getAssetDetails('solana', MINT)).state).toBe('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('deduplicates simultaneous reads of one exact mint', async () => {
    const fetcher = vi.fn(async () => Response.json(fixture())); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const results = await Promise.all(Array.from({ length: 12 }, () => getAssetDetails('solana', MINT)));
    expect(results.every(result => result.state === 'success')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('carries an exact-mint advisory as optional context', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fixture({ advisory: { status: 'caution', reason: 'Issuer notice', url: null, since: NOW - 1000 } }))));
    const { getAssetDetails } = await import('../lib/server/tokens');
    expect((await getAssetDetails('solana', MINT)).details?.advisory).toEqual({ status: 'caution', reason: 'Issuer notice' });
  });
});

describe('transport bounds and route contract', () => {
  it('retries a transient error once and then stops', async () => {
    const fetcher = vi.fn(async () => new Response('temporary', { status: 503 })); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const pending = getAssetDetails('solana', MINT);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toMatchObject({ state: 'unavailable', details: null });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404, 429])('does not fan out or immediately retry HTTP%s', async status => {
    const fetcher = vi.fn(async () => new Response('sensitive upstream text', { status, headers: { 'retry-after': '30' } })); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const result = await getAssetDetails('solana', MINT);
    expect(result).toMatchObject({ state: 'unavailable', details: null });
    expect(JSON.stringify(result)).not.toContain('sensitive upstream text');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds response bytes even when content-length is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(300_000), { headers: { 'content-type': 'application/json' } })));
    const { getAssetDetails } = await import('../lib/server/tokens');
    expect((await getAssetDetails('solana', MINT)).state).toBe('unavailable');
  });

  it.each([
    ['wrong MIME', new Headers({ 'content-type': 'text/html' })],
    ['oversized length', new Headers({ 'content-type': 'application/json', 'content-length': '300000' })],
  ] as const)('cancels rejected response bodies before returning unavailable (%s)', async (_label, headers) => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = vi.fn(async () => new Response(stream, { headers })); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    expect((await getAssetDetails('solana', MINT)).state).toBe('unavailable');
    expect(cancel).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled upstream within the bounded request deadline', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const { getAssetDetails } = await import('../lib/server/tokens');
    const pending = getAssetDetails('solana', MINT);
    await vi.advanceTimersByTimeAsync(6500);
    expect((await pending).state).toBe('unavailable');
  });

  it('bounds optional verification without starting Tokens requests on a stalled catalog', async () => {
    verification.hang = true;
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const pending = getAssetDetails('solana', MINT);
    await vi.advanceTimersByTimeAsync(5500);
    expect((await pending).state).toBe('unavailable'); expect(fetcher).not.toHaveBeenCalled();
  });

  it('caps active and queued requests instead of accumulating arbitrary fan-out', async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const pending = XSTOCK_MINTS.slice(0, 4).map(mint => getAssetDetails('solana', mint));
    expect((await getAssetDetails('solana', XSTOCK_MINTS[4])).state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(25_000);
    expect((await Promise.all(pending)).every(result => result.state === 'unavailable')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('limits actual upstream calls to twenty per process per minute', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const mint = new URL(url).searchParams.get('mint')!;
      const payload = fixture({ mint }); payload.resolution.mint = mint;
      return Response.json(payload);
    });
    vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    const states: string[] = [];
    for (const mint of XSTOCK_MINTS.slice(0, 21)) {
      const pending = getAssetDetails('solana', mint);
      await vi.advanceTimersByTimeAsync(1200);
      states.push((await pending).state);
    }
    expect(states.slice(0, 20).every(state => state === 'success')).toBe(true);
    expect(states[20]).toBe('unavailable'); expect(fetcher).toHaveBeenCalledTimes(20);
  });

  it('honors a provider 429 cooldown across different selected mints', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '30' } }));
    vi.stubGlobal('fetch', fetcher);
    const { getAssetDetails } = await import('../lib/server/tokens');
    expect((await getAssetDetails('solana', XSTOCK_MINTS[0])).state).toBe('unavailable');
    const second = getAssetDetails('solana', XSTOCK_MINTS[1]);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await second).state).toBe('unavailable'); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('answers the switched-off optional route with 200, keeps it no-store, and rejects unexpected query fields', async () => {
    vi.stubEnv('TOKENS_XYZ_ENABLED', 'false');
    const { GET } = await import('../app/api/asset-details/route');
    const response = await GET(new Request(`https://lotline.test/api/asset-details?network=solana&mint=${MINT}`));
    // The body is a complete determination about a supported request, not a fault.
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).state).toBe('configuration-required');
    for (const query of [`network=ethereum&mint=${MINT}`, `network=solana&mint=${MINT}&url=https://example.com`, `network=solana&mint=${MINT}&mint=${MINT}`]) {
      const invalid = await GET(new Request(`https://lotline.test/api/asset-details?${query}`));
      expect(invalid.status).toBe(400);
    }
  });
});
