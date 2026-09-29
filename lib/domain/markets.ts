import kinds from './xstocks-kinds.json' with { type: 'json' };
import { XSTOCK_REGISTRY } from './assets';
import { PRESTOCK_REGISTRY } from './prestocks';
import { MAX_PLAN_ASSETS } from './limits';
import { leverageForSymbol, themeForSymbol, versionGroupForSymbol, type MarketTheme, type VersionGroup } from './market-themes';
import { parsePercent } from './math';
import type { Basket } from './types';
import type { PlannerUniverse } from './planner-universe';

/**
 * Markets: a browsable view of the catalogs Lotline already verifies, with a
 * dated market snapshot beside each asset. The snapshot is context for
 * choosing assets; it is never a quote, and it never feeds an allocation.
 */
export type MarketCategory = 'stocks' | 'etfs' | 'pre-ipo';
/** Categories, plus themes within the ETFs (an ETF with a theme appears under ETFs and under its theme). */
export type MarketFilter = 'all' | MarketCategory | MarketTheme;
export type MarketSort = 'volume' | 'gainers' | 'losers' | 'liquidity' | 'name' | 'price';
export const MARKET_SORTS: readonly MarketSort[] = ['volume', 'gainers', 'losers', 'liquidity', 'name', 'price'];
export const MARKET_FILTERS: readonly MarketFilter[] = ['all', 'stocks', 'etfs', 'metals', 'bonds', 'pre-ipo'];
export const MARKETS_PAGE_SIZE = 20;
export const MARKET_SNAPSHOT_SOURCE = 'Jupiter Tokens API';
export const CHART_RANGES = ['1d', '7d', '30d'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export interface MarketIdentity {
  mint: string;
  symbol: string;
  name: string;
  universe: PlannerUniverse;
  category: MarketCategory;
  logoUrl: string;
  /** Underlying ticker for xStocks; PreStocks track private companies and have none. */
  underlyingSymbol: string | null;
  /** Where the underlying trades, for xStocks. */
  listing: 'US' | 'HK' | null;
  issuer: 'xStocks' | 'PreStocks';
  theme: MarketTheme | null;
  /** The daily multiple a leveraged or inverse ETF states, such as "3×"; null otherwise. */
  leverage: string | null;
}

export interface MarketStats {
  /** USD per displayed token unit, as reported by the snapshot source. */
  price: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  holders: number | null;
  /** The source's own update time for this token, when it reports one. */
  updatedAt: string | null;
}

export interface MarketSnapshot {
  state: 'success' | 'partial' | 'unavailable';
  source: typeof MARKET_SNAPSHOT_SOURCE;
  /** When Lotline read the source. */
  fetchedAt: string;
  stats: Record<string, MarketStats>;
  /** Identities the source did not describe in this snapshot. */
  missing: number;
  /** True when served from cache past its refresh time while a new read runs. */
  stale?: boolean;
  message?: string;
}

export interface MarketRow extends MarketIdentity { stats: MarketStats | null }

const etfs = new Set<string>(kinds.etf);
const hongKong = new Set<string>(kinds.hongKong);
export const XSTOCK_KINDS_SOURCE = kinds.source;

export const MARKET_IDENTITIES: readonly Readonly<MarketIdentity>[] = [
  ...XSTOCK_REGISTRY.map((asset): MarketIdentity => ({
    mint: asset.mint, symbol: asset.symbol, name: asset.name, universe: 'xstocks',
    category: etfs.has(asset.symbol) ? 'etfs' : 'stocks', logoUrl: asset.logoUrl,
    underlyingSymbol: asset.underlyingSymbol, listing: hongKong.has(asset.symbol) ? 'HK' : 'US', issuer: 'xStocks',
    theme: etfs.has(asset.symbol) ? themeForSymbol(asset.symbol) : null, leverage: etfs.has(asset.symbol) ? leverageForSymbol(asset.symbol) : null,
  })),
  ...PRESTOCK_REGISTRY.map((asset): MarketIdentity => ({
    mint: asset.mint, symbol: asset.symbol, name: asset.name, universe: 'prestocks',
    category: 'pre-ipo', logoUrl: asset.logoUrl, underlyingSymbol: null, listing: null, issuer: 'PreStocks', theme: null, leverage: null,
  })),
];
const byMint = new Map(MARKET_IDENTITIES.map(identity => [identity.mint, identity]));
const bySymbol = new Map(MARKET_IDENTITIES.map(identity => [identity.symbol, identity]));
export const MARKET_MINTS: readonly string[] = MARKET_IDENTITIES.map(identity => identity.mint);

export function marketIdentity(mint: string): Readonly<MarketIdentity> | undefined {
  return byMint.get(mint);
}

export function marketIdentityBySymbol(symbol: string): Readonly<MarketIdentity> | undefined {
  return bySymbol.get(symbol);
}

export function categoryCounts(rows: readonly MarketIdentity[]): Record<MarketFilter, number> {
  const counts: Record<MarketFilter, number> = { all: rows.length, stocks: 0, etfs: 0, metals: 0, bonds: 0, 'pre-ipo': 0 };
  for (const row of rows) {
    counts[row.category] += 1;
    if (row.theme) counts[row.theme] += 1;
  }
  return counts;
}

/** The asset's version group with every member row, in the group's own order; null when it has no other version. */
export function versionRows<T extends MarketIdentity>(rows: readonly T[], identity: MarketIdentity): { group: VersionGroup; rows: T[] } | null {
  const group = versionGroupForSymbol(identity.symbol);
  if (!group) return null;
  const members = group.symbols.map(symbol => rows.find(row => row.symbol === symbol)).filter((row): row is T => row !== undefined);
  return members.length > 1 ? { group, rows: members } : null;
}

/** A short type label: leverage first, then theme, then category. */
export function marketTypeLabel(identity: MarketIdentity): string {
  if (identity.leverage) return `${identity.leverage} daily ETF`;
  if (identity.theme === 'metals') return 'Metal ETF';
  if (identity.theme === 'bonds') return 'Bond ETF';
  if (identity.category === 'etfs') return 'ETF';
  if (identity.category === 'pre-ipo') return 'Pre-IPO';
  return identity.listing === 'HK' ? 'Hong Kong share' : 'Share';
}

function matchesFilter(row: MarketIdentity, filter: MarketFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'metals' || filter === 'bonds' ? row.theme === filter : row.category === filter;
}

export function marketRows(snapshot: Pick<MarketSnapshot, 'stats'> | null): MarketRow[] {
  return MARKET_IDENTITIES.map(identity => ({ ...identity, stats: snapshot?.stats[identity.mint] ?? null }));
}

const fold = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Matches name, token symbol, underlying ticker, or a mint prefix of at least four characters. */
export function filterMarkets<T extends MarketIdentity>(rows: readonly T[], filter: MarketFilter, query: string): T[] {
  const raw = query.trim().slice(0, 64);
  const needle = fold(raw);
  return rows.filter(row => {
    if (!matchesFilter(row, filter)) return false;
    if (!needle) return true;
    // Base58 mints are case-sensitive, so a mint prefix is matched exactly.
    return fold(row.name).includes(needle) || fold(row.symbol).includes(needle) ||
      (row.underlyingSymbol !== null && fold(row.underlyingSymbol).startsWith(needle)) ||
      (raw.length >= 4 && row.mint.startsWith(raw));
  });
}

const metric = (row: MarketRow, sort: MarketSort): number | null => {
  const stats = row.stats;
  if (!stats) return null;
  switch (sort) {
    case 'volume': return stats.volume24hUsd;
    case 'gainers': case 'losers': return stats.change24hPct;
    case 'liquidity': return stats.liquidityUsd;
    case 'price': return stats.price;
    default: return null;
  }
};

/** Stable ordering; assets without the sorted figure always follow those with it. */
export function sortMarkets(rows: readonly MarketRow[], sort: MarketSort): MarketRow[] {
  const byName = (a: MarketRow, b: MarketRow) => a.symbol.localeCompare(b.symbol, 'en');
  if (sort === 'name') return [...rows].sort(byName);
  const direction = sort === 'losers' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = metric(a, sort); const right = metric(b, sort);
    if (left === null && right === null) return byName(a, b);
    if (left === null) return 1;
    if (right === null) return -1;
    return left === right ? byName(a, b) : (left < right ? -direction : direction);
  });
}

export function pageOf<T>(rows: readonly T[], page: number, size = MARKETS_PAGE_SIZE): { items: T[]; page: number; pages: number; start: number; end: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, Number.isInteger(page) ? page : 1), pages);
  const start = (current - 1) * size;
  const items = rows.slice(start, start + size);
  return { items, page: current, pages, start: items.length ? start + 1 : 0, end: start + items.length };
}

export type AddToPlanResult =
  | { ok: true; basket: Basket; percent: string }
  | { ok: false; reason: 'duplicate' | 'full' | 'unknown' };

function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  return fraction ? `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}` : String(whole);
}

/**
 * Adds one verified asset to a draft without disturbing the existing split. It
 * takes whatever share is still unassigned, or 0% when the split already totals
 * 100% (or cannot be read), so the reader decides the new percentages.
 */
export function addAssetToBasket(basket: Basket, mint: string, universe: PlannerUniverse): AddToPlanResult {
  const identity = byMint.get(mint);
  if (!identity || identity.universe !== universe) return { ok: false, reason: 'unknown' };
  if (basket.items.some(item => item.mint === mint)) return { ok: false, reason: 'duplicate' };
  if (basket.items.length >= MAX_PLAN_ASSETS) return { ok: false, reason: 'full' };
  let total = 0;
  let readable = true;
  for (const item of basket.items) {
    try { total += parsePercent(item.percent); } catch { readable = false; }
  }
  const remainder = readable ? Math.max(0, 10_000 - total) : 0;
  const percent = formatBps(remainder);
  return { ok: true, percent, basket: { ...basket, items: [...basket.items.map(item => ({ ...item })), { mint, percent }] } };
}

/** Chart points are closing prices in USD per displayed unit, oldest first. */
export interface ChartPoint { t: number; c: number }
export interface ChartResponse {
  state: 'success' | 'unavailable';
  mint: string;
  range: ChartRange;
  points: ChartPoint[];
  source: 'GeckoTerminal';
  pool: { address: string; name: string } | null;
  fetchedAt: string;
  message?: string;
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const smallCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 4 });
const compactCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const wholeCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Display rounding for third-party market figures. Never used for an allocation. */
export function formatMarketPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '—';
  if (value > 0 && value < 1) return smallCurrency.format(value);
  return currency.format(value);
}
export function formatMarketUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '—';
  if (value >= 100_000) return compactCurrency.format(value);
  return wholeCurrency.format(value);
}
export function formatMarketChange(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(2)}%`;
}
export function formatMarketCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '—';
  return count.format(value);
}
export function marketDirection(value: number | null | undefined): 'up' | 'down' | 'flat' | 'none' {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'none';
  return Math.abs(value) < 0.005 ? 'flat' : value > 0 ? 'up' : 'down';
}
