import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BASKET, USDC_MINT } from '../lib/demo/example';
import { PRESTOCK_REGISTRY, PRESTOCK_ISSUER_URL } from '../lib/domain/prestocks';
import { PLANNER_UNIVERSES } from '../lib/domain/planner-universe';
import { loadBasket, saveBasket } from '../lib/domain/storage';
import { buildPlanLink, decodePlanHash, encodePlanHash } from '../lib/domain/share';
import { buildPlanCsv, buildPlanText } from '../lib/domain/export';
import { createPlanIdentity } from '../lib/domain/identity';
import { requestHoldings, requestQuotes, requestUnits } from '../lib/client/planner-requests';

const asset = { ...PRESTOCK_REGISTRY[0], issuerId: 'prestocks' as const, issuerSourceUrl: PRESTOCK_ISSUER_URL, halted: null, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', verifiedAt: '2026-09-21T00:00:00.000Z' };
const basket = { version: 1 as const, budget: '10.000001', items: [{ mint: asset.mint, percent: '100' }] };
const key = PLANNER_UNIVERSES.prestocks.storageKey;
afterEach(() => vi.unstubAllGlobals());

describe('independent planning universes', () => {
  it('saves and clears a PreStocks draft without overwriting the existing xStocks draft', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(saveBasket(storage, DEFAULT_BASKET)).toBe(true);
    expect(loadBasket(storage, undefined, key)).toBeNull();
    expect(saveBasket(storage, basket, undefined, key)).toBe(true);
    expect(loadBasket(storage)).toEqual(DEFAULT_BASKET);
    expect(loadBasket(storage, undefined, key)).toEqual(basket);
    const empty = { ...basket, items: [] };
    expect(saveBasket(storage, empty, undefined, key)).toBe(true);
    expect(loadBasket(storage, undefined, key)).toEqual(empty);
    expect(loadBasket(storage)).toEqual(DEFAULT_BASKET);
  });

  it('keeps legacy xStocks links intact and explicitly identifies PreStocks v2 links', () => {
    expect(decodePlanHash(encodePlanHash(DEFAULT_BASKET, 'example'))).toEqual({ basket: DEFAULT_BASKET, mode: 'example' });
    const link = new URL(buildPlanLink('https://lotline.example', basket, 'live', 'prestocks'));
    expect(link.pathname).toBe('/pre-ipo');
    expect(link.search).toBe('');
    expect(decodePlanHash(link.hash)).toEqual({ basket, mode: 'live', universe: 'prestocks' });
    expect(JSON.parse(Buffer.from(link.hash.slice(6), 'base64url').toString())).toEqual({ v: 2, universe: 'prestocks', mode: 'live', budget: basket.budget, items: [[asset.mint, '100']] });
    expect(() => encodePlanHash(basket, 'example', 'prestocks')).toThrow();
    for (const universe of ['xstocks', 'unknown', undefined]) {
      const payload = { v: 2, universe, mode: 'live', budget: basket.budget, items: [[asset.mint, '100']] };
      expect(decodePlanHash(`#plan=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`)).toBeNull();
    }
    expect(createPlanIdentity('live', basket, 1, 'xstocks')).not.toBe(createPlanIdentity('live', basket, 1, 'prestocks'));
  });

  it('exports the exact contribution and PreStocks planning scope without fabricating estimates', () => {
    const input = { mode: 'live' as const, universe: 'prestocks' as const, basket, assets: [asset], quotes: [] };
    for (const output of [buildPlanCsv(input), buildPlanText(input)]) {
      expect(output).toContain('10.000001');
      expect(output).toContain(asset.mint);
      expect(output).toContain('PreStocks');
      expect(output).toContain('Trading-halt status is not published');
      expect(output).toContain(asset.productUrl);
      expect(output).toContain('Not requested');
      expect(output).not.toContain('xStocks');
    }
  });

  it('routes every read through the fixed PreStocks prefix while retaining the existing DTOs', async () => {
    const fetchedAt = '2026-09-21T00:00:00.000Z';
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      const path = new URL(url, 'https://lotline.example').pathname;
      if (path.endsWith('/quotes')) {
        const items = JSON.parse(options!.body as string).items as { mint: string; usdcRaw: string }[];
        return Response.json({ state: 'success', quotes: items.map(item => ({ ...item, state: 'success', outRaw: '1000000000', units: '1.25', fetchedAt, expiresAt: '2026-09-21T00:00:30.000Z' })) });
      }
      if (path.endsWith('/holdings')) return Response.json({ state: 'success', holdings: [{ mint: asset.mint, state: 'success', raw: '0', units: '0' }], usdc: { mint: USDC_MINT, state: 'success', raw: '0', units: '0' }, fetchedAt });
      return Response.json({ state: 'success', items: [{ mint: asset.mint, units: '1.25' }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect((await requestQuotes([{ mint: asset.mint, usdcRaw: '10000001' }], signal, () => {}, '/api/prestocks')).quotes[0].units).toBe('1.25');
    expect((await requestHoldings(asset.mint, [asset.mint], signal, '/api/prestocks')).holdings[0].raw).toBe('0');
    expect((await requestUnits([{ mint: asset.mint, raw: '1000000000' }], signal, '/api/prestocks')).items[0].units).toBe('1.25');
    expect(fetchMock.mock.calls.map(([url]) => new URL(url, 'https://lotline.example').pathname)).toEqual(['/api/prestocks/quotes', '/api/prestocks/holdings', '/api/prestocks/units']);
  });
});
