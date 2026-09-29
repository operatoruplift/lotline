/**
 * Browsing lenses over the verified catalog, read from each asset's
 * issuer-published name in the pinned registries (for example "iShares Silver
 * Trust xStock" or "Korea 3x Long ETF xStock"). A theme, a leverage label or a
 * version group helps someone find and compare assets; none of them is an
 * allocation, a ranking or a recommendation.
 */
export type MarketTheme = 'metals' | 'bonds';

/** Physical-metal and bond ETFs among the xStocks. Mining shares are equities and stay out of Metals. */
export const THEME_SYMBOLS: Readonly<Record<MarketTheme, readonly string[]>> = {
  metals: ['GLDx', 'FGDLx', 'SLVx', 'PPLTx', 'PALLx'],
  bonds: ['SGOVx', 'TBLLx', 'JPSTx', 'JAAAx', 'FAAAx', 'FLBLx'],
};

/** Daily-leveraged and inverse ETFs, with the multiple their names state. It applies to one day's move. */
export const LEVERAGE_BY_SYMBOL: Readonly<Record<string, string>> = {
  BITXx: '2×', INTWx: '2×', MUUx: '2×', MVLLx: '2×', SNXXx: '2×', KORUx: '3×', SOXLx: '3×', TQQQx: '3×', SOXSx: '−3×',
};

export type VersionGroup = {
  id: string;
  label: string;
  /** Company: the same business through different tokens. Exposure: funds that follow the same index or segment. */
  kind: 'company' | 'exposure';
  symbols: readonly string[];
};

/** Kept deliberately small: only pairings a reader can confirm from the issuers' own names. */
export const VERSION_GROUPS: readonly VersionGroup[] = [
  { id: 'spacex', label: 'SpaceX', kind: 'company', symbols: ['SPCXx', 'SPACEX'] },
  { id: 'micron', label: 'Micron', kind: 'company', symbols: ['MUx', 'MUUx'] },
  { id: 'marvell', label: 'Marvell', kind: 'company', symbols: ['MRVLx', 'MVLLx'] },
  { id: 'intel', label: 'Intel', kind: 'company', symbols: ['INTCx', 'INTWx'] },
  { id: 'sandisk', label: 'Sandisk', kind: 'company', symbols: ['SNDKx', 'SNXXx'] },
  { id: 'sp500', label: 'S&P 500', kind: 'exposure', symbols: ['SPYx', 'VOOx'] },
  { id: 'nasdaq100', label: 'Nasdaq-100', kind: 'exposure', symbols: ['QQQx', 'TQQQx'] },
  { id: 'gold', label: 'Physical gold', kind: 'exposure', symbols: ['GLDx', 'FGDLx'] },
  { id: 'semiconductors', label: 'Semiconductors', kind: 'exposure', symbols: ['SMHx', 'SOXXx', 'SOXLx', 'SOXSx'] },
  { id: 'uranium', label: 'Uranium and nuclear', kind: 'exposure', symbols: ['URAx', 'NLRx'] },
  { id: 'treasury-bills', label: 'US Treasury bills', kind: 'exposure', symbols: ['SGOVx', 'TBLLx'] },
  { id: 'aaa-clo', label: 'AAA-rated CLOs', kind: 'exposure', symbols: ['JAAAx', 'FAAAx'] },
  { id: 'germany', label: 'German stocks', kind: 'exposure', symbols: ['DAXx', 'EWGx'] },
  { id: 'korea', label: 'South Korean stocks', kind: 'exposure', symbols: ['EWYx', 'KORUx'] },
  { id: 'us-small-caps', label: 'US small caps', kind: 'exposure', symbols: ['IWMx', 'IJRx', 'FSMLx'] },
  { id: 'international', label: 'Stocks outside the US', kind: 'exposure', symbols: ['VXUSx', 'SCHFx'] },
  { id: 'europe', label: 'European stocks', kind: 'exposure', symbols: ['VGKx', 'FEZx'] },
];

const themeBySymbol = new Map<string, MarketTheme>(
  (Object.entries(THEME_SYMBOLS) as [MarketTheme, readonly string[]][]).flatMap(([theme, symbols]) => symbols.map(symbol => [symbol, theme] as const)),
);
const groupBySymbol = new Map<string, VersionGroup>(VERSION_GROUPS.flatMap(group => group.symbols.map(symbol => [symbol, group] as const)));

export function themeForSymbol(symbol: string): MarketTheme | null {
  return themeBySymbol.get(symbol) ?? null;
}
export function leverageForSymbol(symbol: string): string | null {
  return LEVERAGE_BY_SYMBOL[symbol] ?? null;
}
export function versionGroupForSymbol(symbol: string): VersionGroup | null {
  return groupBySymbol.get(symbol) ?? null;
}
