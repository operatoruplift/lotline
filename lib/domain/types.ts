export type Mode = 'live' | 'example';
export type State = 'success' | 'partial' | 'unavailable' | 'invalid-input' | 'configuration-required';
export type Asset = {
  symbol: string; name: string; mint: string; decimals: number; tokenProgram: string;
  halted: boolean; verifiedAt: string;
};
export type CatalogResponse = { state: State; assets: Asset[]; unavailable: {symbol: string; message: string}[]; message?: string; };
export type BasketItem = { mint: string; percent: string };
export type Basket = { version: 1; budget: string; items: BasketItem[] };
export type Holding = { mint: string; state: 'success' | 'unavailable'; raw: string | null; units: string | null; message?: string };
export type HoldingsResponse = { state: State; holdings: Holding[]; usdc: Holding; fetchedAt: string; message?: string };
export type Quote = {
  mint: string; state: 'success' | 'unavailable'; usdcRaw: string; outRaw: string | null;
  units: string | null; fetchedAt: string; expiresAt: string; source?: string;
  feeBps?: number; feeMint?: string; message?: string;
};
export type QuotesResponse = { state: State; quotes: Quote[]; message?: string };
export type QuoteRequest = { items: { mint: string; usdcRaw: string }[] };
// Projection is a separate read-only conversion of trusted raw amounts, using fresh mint scaling.
export type ProjectionResponse = { state: State; items: { mint: string; units: string | null; message?: string }[] };
