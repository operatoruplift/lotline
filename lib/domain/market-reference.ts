import * as z from 'zod/mini';

export const PYTH_MAX_AGE_SECONDS = 60;
export const MARKET_REFERENCE_MAX_MINTS = 10;

/** Exact base-ten rendering of Pyth's integer × 10^exponent representation. */
export function pythDecimal(integer: string, exponent: number): string {
  if (!/^(0|[1-9][0-9]{0,19})$/.test(integer) || !Number.isInteger(exponent) || exponent < -12 || exponent > 12) throw new Error('Invalid Pyth decimal.');
  const digits = BigInt(integer).toString();
  if (exponent >= 0) return (BigInt(integer) * 10n ** BigInt(exponent)).toString();
  const padded = digits.padStart(-exponent + 1, '0');
  const fraction = padded.slice(exponent).replace(/0+$/, '');
  return `${padded.slice(0, exponent)}${fraction ? `.${fraction}` : ''}`;
}

/** Four decimal places of basis points, rounded down, without floating-point prices. */
export function pythConfidenceBps(price: string, confidence: string): string {
  if (!/^[1-9][0-9]{0,18}$/.test(price) || !/^(0|[1-9][0-9]{0,19})$/.test(confidence)) throw new Error('Invalid Pyth confidence.');
  return pythDecimal((BigInt(confidence) * 100_000_000n / BigInt(price)).toString(), -4);
}

const timestamp = z.iso.datetime();
const positiveInteger = z.string().check(z.regex(/^[1-9][0-9]{0,18}$/));
const unsignedInteger = z.string().check(z.regex(/^(0|[1-9][0-9]{0,19})$/));
const decimal = z.string().check(z.maxLength(40), z.regex(/^\d+(\.\d+)?$/));
const text = z.string().check(z.minLength(1), z.maxLength(300));
const state = z.enum(['success', 'partial', 'stale', 'unavailable', 'configuration-required', 'invalid-input']);
const mint = z.string().check(z.regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/));

export const pythObservationSchema = z.strictObject({
  feedId: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
  symbol: z.string().check(z.minLength(1), z.maxLength(80)),
  kind: z.enum(['underlying', 'token']),
  quoteCurrency: z.literal('USD'),
  unitBasis: z.enum(['underlying-share', 'unverified-token-unit']),
  price: positiveInteger,
  confidence: unsignedInteger,
  exponent: z.number().check(z.int(), z.minimum(-12), z.maximum(12)),
  publishTime: z.number().check(z.int(), z.minimum(1), z.maximum(4_102_444_800)),
  publishedAt: timestamp,
  fetchedAt: timestamp,
  expiresAt: timestamp,
  state: z.enum(['fresh', 'stale']),
  displayPrice: decimal,
  displayConfidence: decimal,
  confidenceBps: decimal,
}).check(z.superRefine((value, context) => {
  if (!/^[1-9][0-9]{0,18}$/.test(value.price) || !/^(0|[1-9][0-9]{0,19})$/.test(value.confidence)
    || !Number.isInteger(value.exponent) || Math.abs(value.exponent) > 12 || !Number.isSafeInteger(value.publishTime) || value.publishTime < 1 || value.publishTime > 4_102_444_800) return;
  if (BigInt(value.price) > 9_223_372_036_854_775_807n || BigInt(value.confidence) >= BigInt(value.price)
    || value.publishedAt !== new Date(value.publishTime * 1000).toISOString()
    || Date.parse(value.expiresAt) !== value.publishTime * 1000 + PYTH_MAX_AGE_SECONDS * 1000
    || value.displayPrice !== pythDecimal(value.price, value.exponent)
    || value.displayConfidence !== pythDecimal(value.confidence, value.exponent)
    || value.confidenceBps !== pythConfidenceBps(value.price, value.confidence)
    || value.unitBasis !== (value.kind === 'underlying' ? 'underlying-share' : 'unverified-token-unit')) {
    context.addIssue({ code: 'custom', message: 'Inconsistent Pyth observation.' });
  }
}));

const itemSchema = z.strictObject({
  mint, state,
  underlying: z.optional(pythObservationSchema),
  token: z.optional(pythObservationSchema),
  comparison: z.literal('not-comparable'),
  message: z.optional(text),
}).check(z.superRefine((value, context) => {
  if (value.underlying?.kind === 'token' || value.token?.kind === 'underlying'
    || (['success', 'partial', 'stale'].includes(value.state) !== Boolean(value.underlying || value.token))
    || (value.state === 'success' && (value.underlying?.state !== 'fresh' || value.token?.state !== 'fresh'))) {
    context.addIssue({ code: 'custom', message: 'Inconsistent market reference.' });
  }
}));

export const marketReferenceResponseSchema = z.strictObject({
  source: z.literal('pyth'), state, fetchedAt: timestamp, expiresAt: timestamp,
  items: z.array(itemSchema).check(z.maxLength(MARKET_REFERENCE_MAX_MINTS)),
  message: z.optional(text),
}).check(z.refine(value => new Set(value.items.map(item => item.mint)).size === value.items.length));

export type PythObservation = z.infer<typeof pythObservationSchema>;
export type MarketReferenceResponse = z.infer<typeof marketReferenceResponseSchema>;
export type MarketReferenceItem = MarketReferenceResponse['items'][number];

/** Reading or rendering a response never extends its original publish-time lifetime. */
export function isPythObservationFresh(observation: PythObservation, now = Date.now()): boolean {
  return Number.isFinite(now) && observation.publishTime * 1000 <= now && now < Date.parse(observation.expiresAt);
}
