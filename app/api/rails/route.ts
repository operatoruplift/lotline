import { z } from 'zod';
import { XSTOCK_REGISTRY } from '@/lib/domain/assets';
import { RAILS_FRESHNESS_MS, RAILS_MAX_ITEMS, THIN_VENUE_TRADES, impliedUsdcPerUnit, priceDifferenceBps, underlyingOf, type RailComparison, type RailsResponse } from '@/lib/domain/rails';
import { backpackStockMarkets, backpackTicker } from '@/lib/server/backpack';
import { addressSchema, isBoundedRaw, MAX_USDC_RAW, readSmallJson, safeMessage, ServiceError } from '@/lib/server/common';
import { httpStatus, noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const requestSchema = z.object({
  items: z.array(z.object({
    mint: addressSchema,
    usdcRaw: z.string().refine(value => isBoundedRaw(value, MAX_USDC_RAW)),
    units: z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,12})?$/).nullable(),
  }).strict()).min(1).max(RAILS_MAX_ITEMS),
}).strict().refine(value => new Set(value.items.map(item => item.mint)).size === value.items.length);

const registry = new Map(XSTOCK_REGISTRY.map(asset => [asset.mint, asset]));

/** Venue prices for the same underlyings, as a comparison beside the Jupiter estimate. */
export async function POST(request: Request) {
  const fetchedAt = new Date().toISOString();
  const parsed = requestSchema.safeParse(await readSmallJson(request).catch(() => null));
  if (!parsed.success) return Response.json({ state: 'invalid-input', items: [], fetchedAt, message: 'Choose up to ten unique xStocks with their estimates.' } satisfies RailsResponse, { status: 400, headers: noStore });
  try {
    const markets = await backpackStockMarkets();
    const items: RailComparison[] = [];
    for (const item of parsed.data.items) {
      const asset = registry.get(item.mint);
      const underlying = asset ? underlyingOf(asset.symbol) : null;
      const venueSymbol = underlying ? markets.get(underlying) : undefined;
      if (!asset || !underlying || !venueSymbol) continue;
      const ticker = await backpackTicker(venueSymbol);
      const implied = impliedUsdcPerUnit(item.usdcRaw, item.units);
      items.push({
        mint: item.mint,
        symbol: asset.symbol,
        underlying,
        venue: 'backpack',
        venueSymbol,
        venueLastPrice: ticker.lastPrice,
        venueTrades: ticker.trades,
        venueQuoteVolume: ticker.quoteVolume,
        impliedUsdcPerUnit: implied,
        differenceBps: priceDifferenceBps(implied, ticker.lastPrice),
        thin: ticker.trades < THIN_VENUE_TRADES,
        fetchedAt: ticker.fetchedAt,
        expiresAt: new Date(Date.parse(ticker.fetchedAt) + RAILS_FRESHNESS_MS).toISOString(),
        tradeUrl: `https://backpack.exchange/trade/${venueSymbol}`,
      });
    }
    return Response.json({ state: 'success', items, fetchedAt, message: items.length ? 'Backpack Securities venue prices are shown as a comparison for the same underlyings; Lotline routes only through Jupiter.' : 'Backpack Securities does not list these underlyings today.' } satisfies RailsResponse, { headers: noStore });
  } catch (error) {
    const state = error instanceof ServiceError && error.kind === 'invalid-input' ? 'invalid-input' : 'unavailable';
    return Response.json({ state, items: [], fetchedAt, message: safeMessage(error) } satisfies RailsResponse, { status: httpStatus(state), headers: noStore });
  }
}
