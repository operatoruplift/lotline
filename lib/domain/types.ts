export type Mode = 'live' | 'example';
export type State = 'success' | 'partial' | 'unavailable' | 'invalid-input' | 'configuration-required';
export type DataFailureReason = 'no-route' | 'issuer-halted' | 'unsupported-token' | 'rate-limited' | 'stale-verification' | 'provider-unavailable';
export type Asset = {
  symbol: string; name: string; mint: string; decimals: number; tokenProgram: string;
  /** Null means the issuer does not publish a halt flag; it never means active. */
  halted: boolean | null; verifiedAt: string;
  issuerId?: 'xstocks' | 'prestocks';
  instrumentId?: string;
  issuerSourceUrl?: string;
  productUrl?: string;
  description?: string;
  /** Local bundled logo path. Live responses only expose this for curated symbols. */
  logoUrl?: string;
  /** The issuer URL from which the bundled logo and identity were verified. */
  logoSourceUrl?: string;
  issuerIsin?: string;
  underlyingSymbol?: string;
  underlyingIsin?: string;
};
export type CatalogResponse = { state: State; assets: Asset[]; unavailable: {symbol: string; message: string}[]; message?: string; };
export type BasketItem = { mint: string; percent: string };
export type Basket = { version: 1; budget: string; items: BasketItem[] };
/** Original observation used to display raw units; copying it never refreshes its timestamp. */
export type UnitContext = {
  source: 'clock-sysvar' | 'mint'; kind: 'standard' | 'scaled'; decimals: number; tokenProgram: string;
  mintSlot: number; observedAt: string; clockSlot?: number; unixTimestamp?: string; multiplier?: number;
};
export type Holding = { mint: string; state: 'success' | 'unavailable'; raw: string | null; units: string | null; message?: string; unitContext?: UnitContext; balanceSlot?: number; frozenRaw?: string };
export type HoldingsResponse = { state: State; holdings: Holding[]; usdc: Holding; fetchedAt: string; message?: string };
export type Quote = {
  mint: string; state: 'success' | 'unavailable'; usdcRaw: string; outRaw: string | null;
  units: string | null; fetchedAt: string; expiresAt: string; source?: string;
  feeBps?: number; feeMint?: string; message?: string; unitContext?: UnitContext; reasonCode?: DataFailureReason;
};
export type QuotesResponse = { state: State; quotes: Quote[]; message?: string };
export type QuoteRequest = { items: { mint: string; usdcRaw: string }[] };
// Projection is a separate read-only conversion of trusted raw amounts, using fresh mint scaling.
export type ProjectionResponse = { state: State; items: { mint: string; units: string | null; message?: string; unitContext?: UnitContext }[] };
