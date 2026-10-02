import { describe, expect, it } from 'vitest';
import {
  addAssetToBasket, categoryCounts, chartFromResponse, CRYPTO_MARKET_IDENTITIES, filterMarkets, formatMarketChange, formatMarketPrice, formatMarketUsd, MARKET_IDENTITIES, marketDirection, marketIdentities,
  marketIdentity, marketIdentityBySymbol, marketRows, marketTypeLabel, pageOf, sortMarkets, versionRows, type MarketRow,
} from '../lib/domain/markets';
import { LEVERAGE_BY_SYMBOL, THEME_SYMBOLS, VERSION_GROUPS } from '../lib/domain/market-themes';
import kinds from '../lib/domain/xstocks-kinds.json' with { type: 'json' };
import { addToDraft, draftMints } from '../lib/client/plan-draft';
import { buildPlanLink, planLinkTarget } from '../lib/domain/share';
import { MAX_PLAN_ASSETS } from '../lib/domain/limits';
import type { Basket } from '../lib/domain/types';
import { CRYPTO_REGISTRY, cryptoIdentity, SPL_TOKEN_PROGRAM, WRAPPED_SOL_MINT } from '../lib/domain/crypto-assets';
import { existsSync } from 'node:fs';

const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const SPYX = MARKET_IDENTITIES.find(identity => identity.symbol === 'SPYx')!.mint;
const OPENAI = MARKET_IDENTITIES.find(identity => identity.symbol === 'OPENAI')!.mint;
const xstocks = MARKET_IDENTITIES.filter(identity => identity.universe === 'xstocks');

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
}
const row = (symbol: string, stats: Partial<NonNullable<MarketRow['stats']>> | null): MarketRow => {
  const identity = MARKET_IDENTITIES.find(item => item.symbol === symbol)!;
  return { ...identity, stats: stats === null ? null : { price: null, change24hPct: null, volume24hUsd: null, liquidityUsd: null, marketCapUsd: null, holders: null, updatedAt: null, ...stats } };
};

describe('market catalog identities', () => {
  it('covers every pinned xStock and PreStock exactly once, with official ETF flags', () => {
    expect(MARKET_IDENTITIES).toHaveLength(840);
    expect(new Set(MARKET_IDENTITIES.map(identity => identity.mint)).size).toBe(840);
    expect(categoryCounts(MARKET_IDENTITIES)).toEqual({ all: 840, stocks: 778, etfs: 54, metals: 5, bonds: 6, 'pre-ipo': 8, crypto: 0 });
    // Crypto is listed only with its flag; lookups always resolve it.
    expect(categoryCounts(marketIdentities(true))).toMatchObject({ all: 848, crypto: 8 });
    expect(marketIdentities(false)).toBe(MARKET_IDENTITIES);
    expect(marketIdentity(SPYX)).toMatchObject({ category: 'etfs', underlyingSymbol: 'SPY', listing: 'US', issuer: 'xStocks' });
    expect(marketIdentity(AAPLX)).toMatchObject({ category: 'stocks', underlyingSymbol: 'AAPL' });
    expect(marketIdentity(OPENAI)).toMatchObject({ category: 'pre-ipo', universe: 'prestocks', underlyingSymbol: null, listing: null, issuer: 'PreStocks' });
    expect(xstocks.filter(identity => identity.listing === 'HK')).toHaveLength(79);
    expect(MARKET_IDENTITIES.every(identity => identity.logoUrl.startsWith('/logos/'))).toBe(true);
  });

  it('attaches snapshot figures by mint and leaves the rest empty', () => {
    const rows = marketRows({ stats: { [AAPLX]: { price: 340.45, change24hPct: 0.17, volume24hUsd: 601_782, liquidityUsd: 590_605, marketCapUsd: 52_519_815, holders: 34_706, updatedAt: '2026-09-28T15:26:12.317Z' } } });
    expect(rows.find(item => item.mint === AAPLX)?.stats?.price).toBe(340.45);
    expect(rows.find(item => item.mint === SPYX)?.stats).toBeNull();
    expect(marketRows(null).every(item => item.stats === null)).toBe(true);
  });
});

describe('filtering, sorting and paging', () => {
  it('filters by type and by name, symbol, underlying prefix or a mint prefix of four or more characters', () => {
    expect(filterMarkets(MARKET_IDENTITIES, 'etfs', '').every(identity => identity.category === 'etfs')).toBe(true);
    expect(filterMarkets(MARKET_IDENTITIES, 'all', 'apple').map(identity => identity.symbol)).toContain('AAPLx');
    expect(filterMarkets(MARKET_IDENTITIES, 'all', '  AAPL ').map(identity => identity.symbol)).toContain('AAPLx');
    expect(filterMarkets(MARKET_IDENTITIES, 'all', 'XsbE').map(identity => identity.symbol).sort()).toEqual(['AAPLx', 'IWMx']);
    expect(filterMarkets(MARKET_IDENTITIES, 'all', 'XsbEh').map(identity => identity.symbol)).toEqual(['AAPLx']);
    expect(filterMarkets(MARKET_IDENTITIES, 'all', 'xsbeh')).toEqual([]);
    expect(filterMarkets(MARKET_IDENTITIES, 'all', 'Xsb').map(identity => identity.symbol)).not.toContain('AAPLx');
    expect(filterMarkets(MARKET_IDENTITIES, 'pre-ipo', 'open').map(identity => identity.symbol)).toEqual(['OPENAI']);
    expect(filterMarkets(MARKET_IDENTITIES, 'etfs', 'apple')).toEqual([]);
  });

  it('orders by the chosen figure, puts missing figures last and breaks ties by symbol', () => {
    const rows = [row('AAPLx', { volume24hUsd: 10, change24hPct: 1.5, liquidityUsd: 5, price: 340 }), row('SPYx', { volume24hUsd: 30, change24hPct: -2, liquidityUsd: 50, price: 660 }),
      row('MSFTx', null), row('NVDAx', { volume24hUsd: 30, change24hPct: 0.1, liquidityUsd: null, price: 180 })];
    expect(sortMarkets(rows, 'volume').map(item => item.symbol)).toEqual(['NVDAx', 'SPYx', 'AAPLx', 'MSFTx']);
    expect(sortMarkets(rows, 'gainers').map(item => item.symbol)).toEqual(['AAPLx', 'NVDAx', 'SPYx', 'MSFTx']);
    expect(sortMarkets(rows, 'losers').map(item => item.symbol)).toEqual(['SPYx', 'NVDAx', 'AAPLx', 'MSFTx']);
    expect(sortMarkets(rows, 'liquidity').map(item => item.symbol)).toEqual(['SPYx', 'AAPLx', 'MSFTx', 'NVDAx']);
    expect(sortMarkets(rows, 'name').map(item => item.symbol)).toEqual(['AAPLx', 'MSFTx', 'NVDAx', 'SPYx']);
    expect(rows.map(item => item.symbol)).toEqual(['AAPLx', 'SPYx', 'MSFTx', 'NVDAx']);
  });

  it('clamps pages and reports the visible range', () => {
    const items = Array.from({ length: 45 }, (_, index) => index);
    expect(pageOf(items, 1)).toMatchObject({ page: 1, pages: 3, start: 1, end: 20 });
    expect(pageOf(items, 3)).toMatchObject({ page: 3, start: 41, end: 45 });
    expect(pageOf(items, 99).page).toBe(3);
    expect(pageOf(items, 0).page).toBe(1);
    expect(pageOf(items, 1.5).page).toBe(1);
    expect(pageOf([], 1)).toMatchObject({ page: 1, pages: 1, start: 0, end: 0, items: [] });
  });
});

describe('adding an asset to a plan', () => {
  const basket = (items: [string, string][]): Basket => ({ version: 1, budget: '1000', items: items.map(([mint, percent]) => ({ mint, percent })) });
  const others = xstocks.filter(identity => identity.mint !== AAPLX).map(identity => identity.mint);

  it('gives the new asset the unassigned share and never edits the existing split', () => {
    expect(addAssetToBasket(basket([]), AAPLX, 'xstocks')).toMatchObject({ ok: true, percent: '100' });
    expect(addAssetToBasket(basket([[others[0], '100']]), AAPLX, 'xstocks')).toMatchObject({ ok: true, percent: '0' });
    expect(addAssetToBasket(basket([[others[0], '60']]), AAPLX, 'xstocks')).toMatchObject({ ok: true, percent: '40' });
    expect(addAssetToBasket(basket([[others[0], '33.33'], [others[1], '33.33']]), AAPLX, 'xstocks')).toMatchObject({ ok: true, percent: '33.34' });
    expect(addAssetToBasket(basket([[others[0], '25.5']]), AAPLX, 'xstocks')).toMatchObject({ ok: true, percent: '74.5' });
    expect(addAssetToBasket(basket([[others[0], 'abc']]), AAPLX, 'xstocks')).toMatchObject({ ok: true, percent: '0' });
    const original = basket([[others[0], '60']]);
    const result = addAssetToBasket(original, AAPLX, 'xstocks');
    expect(original.items).toHaveLength(1);
    expect(result.ok && result.basket.items).toEqual([{ mint: others[0], percent: '60' }, { mint: AAPLX, percent: '40' }]);
  });

  it('refuses duplicates, full plans and assets from the other catalog', () => {
    expect(addAssetToBasket(basket([[AAPLX, '100']]), AAPLX, 'xstocks')).toEqual({ ok: false, reason: 'duplicate' });
    expect(addAssetToBasket(basket(others.slice(0, MAX_PLAN_ASSETS).map(mint => [mint, '10'])), AAPLX, 'xstocks')).toEqual({ ok: false, reason: 'full' });
    expect(addAssetToBasket(basket([]), OPENAI, 'xstocks')).toEqual({ ok: false, reason: 'unknown' });
    expect(addAssetToBasket(basket([]), 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'xstocks')).toEqual({ ok: false, reason: 'unknown' });
    // Crypto joins the stock planner, never the PreStocks one.
    expect(addAssetToBasket(basket([]), 'So11111111111111111111111111111111111111112', 'xstocks')).toMatchObject({ ok: true });
    expect(addAssetToBasket(basket([]), 'So11111111111111111111111111111111111111112', 'prestocks')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('writes to the matching device draft and reports what is already planned', () => {
    const storage = memoryStorage({ 'lotline:basket:v1': JSON.stringify(basket([[others[0], '50']])) });
    expect(addToDraft(storage, AAPLX)).toEqual({ ok: true, symbol: 'AAPLx', percent: '50', path: '/app' });
    expect(addToDraft(storage, OPENAI)).toEqual({ ok: true, symbol: 'OPENAI', percent: '100', path: '/pre-ipo' });
    expect(JSON.parse(storage.values.get('lotline:basket:v1')!).items).toEqual([{ mint: others[0], percent: '50' }, { mint: AAPLX, percent: '50' }]);
    expect(JSON.parse(storage.values.get('lotline:prestocks:basket:v1')!).items).toEqual([{ mint: OPENAI, percent: '100' }]);
    expect(addToDraft(storage, AAPLX)).toMatchObject({ ok: false, reason: 'duplicate', symbol: 'AAPLx' });
    expect(addToDraft(storage, 'not-a-mint')).toEqual({ ok: false, reason: 'unknown' });
    expect([...draftMints(storage)].sort()).toEqual([others[0], AAPLX, OPENAI].sort());
    const failing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(addToDraft(failing, AAPLX)).toMatchObject({ ok: false, reason: 'storage' });
  });
});

describe('display formatting and plan links', () => {
  it('rounds third-party figures for reading and marks direction with a sign', () => {
    expect([formatMarketPrice(340.4513), formatMarketPrice(0.012345), formatMarketPrice(null), formatMarketPrice(-1)]).toEqual(['$340.45', '$0.01235', '—', '—']);
    expect([formatMarketUsd(590_605.58), formatMarketUsd(717.9), formatMarketUsd(undefined)]).toEqual(['$590.6K', '$718', '—']);
    expect([formatMarketChange(0.1713), formatMarketChange(-2.5), formatMarketChange(0.001), formatMarketChange(null)]).toEqual(['+0.17%', '−2.50%', '0.00%', '—']);
    expect([marketDirection(1), marketDirection(-1), marketDirection(0.001), marketDirection(null)]).toEqual(['up', 'down', 'flat', 'none']);
  });

  it('opens only same-origin planner links that carry a plan fragment', () => {
    const origin = 'https://lotline.dev';
    const plan: Basket = { version: 1, budget: '1000', items: [{ mint: AAPLX, percent: '100' }] };
    const link = buildPlanLink(origin, plan, 'live');
    expect(planLinkTarget(link, origin)).toMatch(/^\/app#plan=/);
    expect(planLinkTarget(`  ${link}  `, origin)).toMatch(/^\/app#plan=/);
    expect(planLinkTarget(buildPlanLink(origin, plan, 'example'), origin)).toMatch(/^\/app\?mode=example#plan=/);
    expect(planLinkTarget(link.replace('/app#', '/app?next=https://evil.example#'), origin)).toBeNull();
    expect(planLinkTarget(link.replace(origin, 'https://evil.example'), origin)).toBeNull();
    expect(planLinkTarget(`${origin}/markets#plan=abc`, origin)).toBeNull();
    expect(planLinkTarget(`${origin}/app`, origin)).toBeNull();
    expect(planLinkTarget('javascript:alert(1)', origin)).toBeNull();
    expect(planLinkTarget(`${origin}/app#plan=${'a'.repeat(3000)}`, origin)).toBeNull();
  });
});

describe('themes, leverage and versions', () => {
  const etfs = new Set<string>(kinds.etf);
  it('draws Metals and Bonds only from ETFs in the pinned registry, and keeps them under ETFs too', () => {
    for (const symbols of Object.values(THEME_SYMBOLS)) for (const symbol of symbols) {
      expect(etfs.has(symbol), symbol).toBe(true);
      expect(marketIdentityBySymbol(symbol)?.category, symbol).toBe('etfs');
    }
    expect(filterMarkets(MARKET_IDENTITIES, 'metals', '').map(identity => identity.symbol).sort()).toEqual([...THEME_SYMBOLS.metals].sort());
    expect(filterMarkets(MARKET_IDENTITIES, 'bonds', 'treasury').map(identity => identity.symbol)).toEqual(['SGOVx']);
    expect(filterMarkets(MARKET_IDENTITIES, 'etfs', 'gold').map(identity => identity.symbol)).toEqual(expect.arrayContaining(['GLDx', 'FGDLx', 'GDXx']));
    expect(marketIdentityBySymbol('GDXx')?.theme).toBeNull();
  });

  it('labels only ETFs whose names state a daily multiple', () => {
    for (const symbol of Object.keys(LEVERAGE_BY_SYMBOL)) expect(etfs.has(symbol), symbol).toBe(true);
    expect(marketIdentityBySymbol('TQQQx')?.leverage).toBe('3×');
    expect(marketIdentityBySymbol('SOXSx')?.leverage).toBe('−3×');
    expect(marketIdentityBySymbol('QQQx')?.leverage).toBeNull();
    expect(['TQQQx', 'GLDx', 'SGOVx', 'SPYx', 'AAPLx', 'OPENAI'].map(symbol => marketTypeLabel(marketIdentityBySymbol(symbol)!)))
      .toEqual(['3× daily ETF', 'Metal ETF', 'Bond ETF', 'ETF', 'Share', 'Pre-IPO']);
  });

  it('groups versions only among pinned assets, each asset in one group at most', () => {
    const seen = new Set<string>();
    for (const group of VERSION_GROUPS) {
      expect(group.symbols.length, group.id).toBeGreaterThan(1);
      for (const symbol of group.symbols) {
        expect(marketIdentityBySymbol(symbol), symbol).toBeDefined();
        expect(seen.has(symbol), symbol).toBe(false);
        seen.add(symbol);
      }
    }
    const spacex = versionRows(marketRows(null), marketIdentityBySymbol('SPACEX')!);
    expect(spacex?.group.kind).toBe('company');
    expect(spacex?.rows.map(row => [row.symbol, row.issuer])).toEqual([['SPCXx', 'xStocks'], ['SPACEX', 'PreStocks']]);
    expect(versionRows(marketRows(null), marketIdentityBySymbol('SOXLx')!)?.rows.map(row => row.symbol)).toEqual(['SMHx', 'SOXXx', 'SOXLx', 'SOXSx']);
    expect(versionRows(marketRows(null), marketIdentityBySymbol('AAPLx')!)).toBeNull();
  });
});

describe('crypto behind its flag', () => {
  it('pins eight tokens with a named issuer, bundled logos and no overlap with the stock catalogs', () => {
    expect(CRYPTO_REGISTRY.map(asset => asset.symbol)).toEqual(['SOL', 'cbBTC', 'WBTC', 'ETH', 'JitoSOL', 'mSOL', 'JupSOL', 'INF']);
    expect(new Set(CRYPTO_REGISTRY.map(asset => asset.mint)).size).toBe(8);
    for (const asset of CRYPTO_REGISTRY) {
      expect(MARKET_IDENTITIES.some(identity => identity.mint === asset.mint || identity.symbol === asset.symbol), asset.symbol).toBe(false);
      expect(existsSync(new URL(`../public${asset.logoUrl}`, import.meta.url)), asset.logoUrl).toBe(true);
      expect(asset.issuer.length).toBeGreaterThan(2);
      expect(asset.backing.length).toBeGreaterThan(10);
    }
    expect(cryptoIdentity(WRAPPED_SOL_MINT)).toMatchObject({ symbol: 'SOL', decimals: 9, kind: 'coin' });
    expect(CRYPTO_REGISTRY.filter(asset => asset.freezable).map(asset => asset.symbol)).toEqual(['cbBTC']);
    expect(SPL_TOKEN_PROGRAM).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  });

  it('joins the stock planner, labels each kind and filters, searches and groups like any market', () => {
    const rows = marketRows(null, marketIdentities(true));
    expect(CRYPTO_MARKET_IDENTITIES.every(identity => identity.universe === 'xstocks' && identity.category === 'crypto')).toBe(true);
    expect(['SOL', 'cbBTC', 'ETH', 'JitoSOL'].map(symbol => marketTypeLabel(marketIdentityBySymbol(symbol)!))).toEqual(['Coin', 'Bridged BTC', 'Bridged ETH', 'Staked SOL']);
    expect(filterMarkets(rows, 'crypto', '').map(row => row.symbol)).toEqual(CRYPTO_REGISTRY.map(asset => asset.symbol));
    expect(filterMarkets(rows, 'crypto', 'btc').map(row => row.symbol)).toEqual(['cbBTC', 'WBTC']);
    expect(filterMarkets(marketRows(null), 'all', 'cbBTC')).toEqual([]);
    const bitcoin = versionRows(rows, marketIdentityBySymbol('cbBTC')!);
    expect(bitcoin?.group.label).toBe('Bitcoin');
    expect(bitcoin?.rows.map(row => row.symbol)).toEqual(['cbBTC', 'WBTC', 'BITXx']);
    expect(versionRows(marketRows(null), marketIdentityBySymbol('BITXx')!)).toBeNull();
  });
});

describe('reading a chart answer', () => {
  const mint = MARKET_IDENTITIES[0].mint;
  const now = new Date('2026-10-03T12:00:00.000Z');
  const success = { state: 'success', mint, range: '1d', points: [{ t: 1, c: 2 }, { t: 2, c: 3 }], source: 'GeckoTerminal', pool: null, fetchedAt: now.toISOString() };
  const refused = (message: string) => ({ state: 'unavailable', mint, range: '1d', points: [], source: 'GeckoTerminal', pool: null, fetchedAt: now.toISOString(), message });
  it('passes through an answer for the asset and range asked about', () => {
    expect(chartFromResponse(200, success, mint, '1d', now)).toEqual(success);
    const busy = { ...refused('The chart source is busy. Try again in a minute.'), retryable: true };
    expect(chartFromResponse(200, busy, mint, '1d', now)).toEqual(busy);
  });
  it('refuses an answer about another asset or range, or with unusable prices, without offering to ask again', () => {
    for (const body of [{ ...success, mint: MARKET_IDENTITIES[1].mint }, { ...success, range: '7d' }, { ...success, points: [{ t: 1, c: -2 }] }, null, 'nope']) {
      expect(chartFromResponse(200, body, mint, '1d', now)).toEqual(refused('The price history could not be verified.'));
    }
  });
  it('offers to ask again after a refusal, an outage or no answer, but not after a bad request', () => {
    const limited = 'Too many live reads from this connection. Wait a moment, then retry.';
    expect(chartFromResponse(429, { state: 'unavailable', message: limited }, mint, '1d', now)).toEqual({ ...refused(limited), retryable: true });
    expect(chartFromResponse(503, null, mint, '1d', now)).toEqual({ ...refused('The price history could not be loaded.'), retryable: true });
    // Status 0: no answer arrived (offline or timed out).
    expect(chartFromResponse(0, null, mint, '1d', now)).toEqual({ ...refused('The price history could not be loaded.'), retryable: true });
    expect(chartFromResponse(400, { state: 'invalid-input', message: 'Choose one catalog asset and a range of 1d, 7d or 30d.' }, mint, '1d', now))
      .toEqual(refused('Choose one catalog asset and a range of 1d, 7d or 30d.'));
    expect(chartFromResponse(503, { message: 'x'.repeat(201) }, mint, '1d', now).message).toBe('The price history could not be loaded.');
  });
});
