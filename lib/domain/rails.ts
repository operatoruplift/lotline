/**
 * Other venues for the same underlying. Backpack Securities issues its own
 * tokenized stocks and publishes a keyless venue tape; where one of those
 * underlyings is also an xStock, the venue's last trade is a second price
 * reference beside the Jupiter estimate. Different tokens, same underlying:
 * a comparison, never a route. Verified against Backpack's public market list
 * on 27 September 2026.
 */
export const BACKPACK_UNDERLYINGS = ['MU', 'SNDK', 'SPCX', 'SKHY'] as const;
export const RAILS_FRESHNESS_MS = 30_000;
export const RAILS_MAX_ITEMS = 10;
/** A venue day with fewer trades than this is shown as thin rather than as a price to lean on. */
export const THIN_VENUE_TRADES = 50;

export type RailComparison = {
  mint: string;
  symbol: string;
  underlying: string;
  venue: 'backpack';
  venueSymbol: string;
  venueLastPrice: string;
  venueTrades: number;
  venueQuoteVolume: string;
  impliedUsdcPerUnit: string | null;
  differenceBps: string | null;
  thin: boolean;
  fetchedAt: string;
  expiresAt: string;
  tradeUrl: string;
};
export type RailsResponse = {
  state: 'success' | 'unavailable' | 'invalid-input';
  items: RailComparison[];
  fetchedAt: string;
  message: string;
};

/** The xStock ticker without its trailing x, or null when the symbol is not shaped like one. */
export function underlyingOf(symbol: string): string | null {
  const match = /^([A-Z0-9.]{1,10})x$/.exec(symbol);
  return match ? match[1] : null;
}

export function backpackListed(symbol: string): boolean {
  const underlying = underlyingOf(symbol);
  return underlying !== null && (BACKPACK_UNDERLYINGS as readonly string[]).includes(underlying);
}

const DECIMAL = /^(0|[1-9]\d{0,17})(\.\d{1,12})?$/;
const SCALE = 8;
/** An exact decimal string as an integer scaled by 10^8; null for anything else. */
export function scaled(value: string): bigint | null {
  if (!DECIMAL.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(SCALE) + BigInt((fraction + '0'.repeat(SCALE)).slice(0, SCALE));
}
function formatScaled(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const divisor = 10n ** BigInt(SCALE - decimals);
  const rounded = magnitude / divisor;
  const unit = 10n ** BigInt(decimals);
  const whole = rounded / unit;
  const fraction = (rounded % unit).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole}${decimals ? `.${fraction}` : ''}`;
}

/**
 * The USDC a quote pays per display unit it expects back, truncated to six
 * decimals: micro-USDC input over estimated units, exact integer arithmetic.
 */
export function impliedUsdcPerUnit(usdcRaw: string, units: string | null): string | null {
  if (units === null || !/^(0|[1-9]\d{0,17})$/.test(usdcRaw)) return null;
  const unitsScaled = scaled(units);
  if (unitsScaled === null || unitsScaled === 0n) return null;
  // micro-USDC × 10^8 ÷ (units × 10^8) = micro-USDC per unit; re-scale to 10^8 for formatting.
  const microPerUnit = (BigInt(usdcRaw) * 10n ** BigInt(SCALE)) / unitsScaled;
  return formatScaled(microPerUnit * 10n ** BigInt(SCALE - 6), 6);
}

/** Signed basis points of the implied price relative to the venue price, truncated toward zero. */
export function priceDifferenceBps(implied: string | null, venuePrice: string): string | null {
  if (implied === null) return null;
  const a = scaled(implied);
  const b = scaled(venuePrice);
  if (a === null || b === null || b === 0n) return null;
  return ((a - b) * 10_000n / b).toString();
}

export function isRailFresh(item: Pick<RailComparison, 'fetchedAt' | 'expiresAt'>, now: number): boolean {
  const fetched = Date.parse(item.fetchedAt);
  const expires = Date.parse(item.expiresAt);
  return Number.isFinite(fetched) && Number.isFinite(expires) && fetched <= now && now < expires;
}

export const RAIL_COPY = {
  scope: 'Backpack Securities issues its own tokenized stocks; xStocks issues separate tokens for the same companies. Lotline shows the venue price as a comparison and routes only through Jupiter.',
  account: 'Trading on Backpack needs a Backpack account. Lotline never opens one, signs there, or moves funds there.',
  thin: (trades: number) => `${trades} venue trade${trades === 1 ? '' : 's'} in the last day, so this price is a thin reference.`,
} as const;
