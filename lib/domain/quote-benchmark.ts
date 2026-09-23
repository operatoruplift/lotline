import type { Quote } from './types';
import { PYTH_FEED_MAPPINGS, PYTH_USDC_FEED_ID, isPythObservationFresh, marketReferenceResponseSchema } from './market-reference';

type Benchmark = { state: 'available'; usdPerShare: string; differencePercent: string; usdcUsd: string; expiresAt: string }
  | { state: 'unavailable'; message: string };
const unavailable = (message: string): Benchmark => ({ state: 'unavailable', message });
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

function decimalRatio(value: string): { numerator: bigint; denominator: bigint } | null {
  // A bounded decimal from the official on-chain amount-to-UI conversion, before
  // the table formats it. Do not parse a localized or abbreviated display label.
  if (!/^(0|[1-9]\d{0,29})(\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const numerator = BigInt(whole + fraction);
  return numerator > 0n ? { numerator, denominator: 10n ** BigInt(fraction.length) } : null;
}

/** Truncate toward zero; all price arithmetic stays in bounded integer ratios. */
function formatRatio(numerator: bigint, denominator: bigint, places: number): string {
  const negative = numerator < 0n;
  const scaled = (negative ? -numerator : numerator) * 10n ** BigInt(places) / denominator;
  const digits = scaled.toString().padStart(places + 1, '0');
  const fraction = digits.slice(-places).replace(/0+$/, '');
  return `${negative && scaled !== 0n ? '-' : ''}${digits.slice(0, -places)}${fraction ? `.${fraction}` : ''}`;
}

/**
 * A planning-estimate benchmark, not the later executable order or a fair value.
 * Issuer semantics: https://docs.xstocks.fi/developers/multipliers
 * Scaled Solana UI units express underlying-share exposure. USDC is converted
 * using its own pinned USD observation; the ambiguous token feed is not used.
 */
export function quoteBenchmark(quote: Quote | undefined, response: unknown, now = Date.now()): Benchmark {
  const parsed = marketReferenceResponseSchema.safeParse(response);
  const mapping = PYTH_FEED_MAPPINGS.find(item => item.mint === quote?.mint);
  if (!parsed.success || !mapping || !Number.isFinite(now)) return unavailable('No verified equity benchmark is available.');
  const equity = parsed.data.items.find(item => item.mint === mapping.mint)?.underlying;
  const usdc = parsed.data.usdc;
  if (!equity || equity.feedId !== mapping.underlying || !usdc || usdc.feedId !== PYTH_USDC_FEED_ID
    || equity.state !== 'fresh' || usdc.state !== 'fresh' || !isPythObservationFresh(equity, now) || !isPythObservationFresh(usdc, now)) {
    return unavailable('Fresh equity and USDC/USD references are needed for this comparison.');
  }
  if (!quote || quote.state !== 'success' || typeof quote.usdcRaw !== 'string' || !/^[1-9]\d{0,19}$/.test(quote.usdcRaw)
    || typeof quote.outRaw !== 'string' || !/^[1-9]\d{0,19}$/.test(quote.outRaw) || typeof quote.units !== 'string' || !quote.units) return unavailable('A verified estimate with converted units is needed.');
  const quoteTime = Date.parse(quote.fetchedAt);
  const quoteExpiry = Math.min(Date.parse(quote.expiresAt), quoteTime + 30_000);
  if (!Number.isFinite(quoteTime) || quoteTime > now || !Number.isFinite(quoteExpiry) || now >= quoteExpiry) return unavailable('Refresh the expired contribution estimate to compare prices.');
  const context = quote.unitContext;
  const observedAt = Date.parse(context?.observedAt ?? '');
  if (!context || context.kind !== 'scaled' || context.source !== 'clock-sysvar' || context.tokenProgram !== TOKEN_2022
    || !Number.isInteger(context.decimals) || context.decimals < 0 || context.decimals > 18
    || !Number.isSafeInteger(context.mintSlot) || context.mintSlot <= 0 || context.clockSlot !== context.mintSlot
    || !/^[1-9]\d{0,11}$/.test(context.unixTimestamp ?? '') || !Number.isFinite(context.multiplier) || context.multiplier! <= 0
    || !Number.isFinite(observedAt) || observedAt > now || now >= observedAt + 30_000) {
    return unavailable('A current mint and chain-time scaling snapshot is needed.');
  }
  const units = decimalRatio(quote.units);
  if (!units) return unavailable('The converted output is too small or unavailable for comparison.');
  const usdNumerator = BigInt(quote.usdcRaw) * BigInt(usdc.price) * units.denominator * 10n ** BigInt(Math.max(0, usdc.exponent));
  const usdDenominator = 1_000_000n * units.numerator * 10n ** BigInt(Math.max(0, -usdc.exponent));
  const equityNumerator = BigInt(equity.price) * 10n ** BigInt(Math.max(0, equity.exponent));
  const equityDenominator = 10n ** BigInt(Math.max(0, -equity.exponent));
  const differenceNumerator = (usdNumerator * equityDenominator - equityNumerator * usdDenominator) * 100n;
  const differenceDenominator = usdDenominator * equityNumerator;
  return {
    state: 'available', usdPerShare: formatRatio(usdNumerator, usdDenominator, 8),
    differencePercent: formatRatio(differenceNumerator, differenceDenominator, 4), usdcUsd: usdc.displayPrice,
    expiresAt: new Date(Math.min(quoteExpiry, observedAt + 30_000, Date.parse(equity.expiresAt), Date.parse(usdc.expiresAt))).toISOString(),
  };
}
