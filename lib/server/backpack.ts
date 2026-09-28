import 'server-only';
import { z } from 'zod';
import { BoundedCache, ServiceError, SpacedQueue, fetchJson } from './common';

/**
 * Backpack's public market data: keyless, read-only, bounded. The market list
 * says which underlyings the venue tokenizes today; the ticker gives the venue
 * tape for one of them. No account, order or RFQ endpoint is touched here.
 */
export const BACKPACK_HOST = 'https://api.backpack.exchange';
const MARKETS_TTL_MS = 15 * 60_000;
const TICKER_TTL_MS = 20_000;
const queue = new SpacedQueue(250, 8);
const marketsCache = new BoundedCache<Map<string, string>>(1);
const tickerCache = new BoundedCache<BackpackTicker>(32);
let marketsPending: Promise<Map<string, string>> | undefined;

const marketSchema = z.object({
  symbol: z.string().max(40),
  baseSymbol: z.string().max(20),
  quoteSymbol: z.string().max(20),
  marketType: z.string().max(20),
  orderBookState: z.string().max(20).optional(),
});
const marketsSchema = z.array(marketSchema).max(2000);
const decimal = z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,12})?$/);
const tickerSchema = z.object({
  symbol: z.string().max(40),
  firstPrice: decimal,
  lastPrice: decimal,
  high: decimal,
  low: decimal,
  volume: decimal,
  quoteVolume: decimal,
  trades: z.string().regex(/^\d{1,12}$/),
}).passthrough();
export type BackpackTicker = { symbol: string; lastPrice: string; firstPrice: string; high: string; low: string; volume: string; quoteVolume: string; trades: number; fetchedAt: string };

/** Underlying ticker → spot market symbol, for the tokenized stocks Backpack lists in USDC. */
export async function backpackStockMarkets(): Promise<Map<string, string>> {
  const cached = marketsCache.get('markets');
  if (cached) return cached;
  if (!marketsPending) {
    marketsPending = queue.run(async () => {
      const parsed = marketsSchema.safeParse(await fetchJson(`${BACKPACK_HOST}/api/v1/markets`, { headers: { Accept: 'application/json' } }));
      if (!parsed.success) throw new ServiceError('unavailable', 'Backpack returned an unverified market list.');
      const markets = new Map<string, string>();
      for (const market of parsed.data) {
        const underlying = /^([A-Z0-9]{1,10})\.US$/.exec(market.baseSymbol)?.[1];
        if (underlying && market.quoteSymbol === 'USDC' && market.marketType === 'SPOT' && market.symbol === `${market.baseSymbol}_USDC` && (market.orderBookState ?? 'Open') === 'Open') markets.set(underlying, market.symbol);
      }
      marketsCache.set('markets', markets, MARKETS_TTL_MS);
      return markets;
    }).finally(() => { marketsPending = undefined; });
  }
  return marketsPending;
}

/** The venue's 24-hour tape for one listed market. */
export async function backpackTicker(symbol: string): Promise<BackpackTicker> {
  if (!/^[A-Z0-9]{1,10}\.US_USDC$/.test(symbol)) throw new ServiceError('invalid-input', 'That Backpack market symbol is not supported.');
  const cached = tickerCache.get(symbol);
  if (cached) return cached;
  return queue.run(async () => {
    const url = new URL(`${BACKPACK_HOST}/api/v1/ticker`);
    url.searchParams.set('symbol', symbol);
    const parsed = tickerSchema.safeParse(await fetchJson(url.href, { headers: { Accept: 'application/json' } }));
    if (!parsed.success || parsed.data.symbol !== symbol || parsed.data.lastPrice.startsWith('-')) throw new ServiceError('unavailable', 'Backpack returned an unverified ticker.');
    const ticker: BackpackTicker = { symbol, lastPrice: parsed.data.lastPrice, firstPrice: parsed.data.firstPrice, high: parsed.data.high, low: parsed.data.low, volume: parsed.data.volume, quoteVolume: parsed.data.quoteVolume, trades: Number(parsed.data.trades), fetchedAt: new Date().toISOString() };
    tickerCache.set(symbol, ticker, TICKER_TTL_MS);
    return ticker;
  });
}
