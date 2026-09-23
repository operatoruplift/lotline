import * as z from 'zod/mini';

export const PYTH_MAX_AGE_SECONDS = 60;
export const MARKET_REFERENCE_MAX_MINTS = 10;

// Pinned to official Hermes metadata. A token feed does not establish share equivalence.
export const PYTH_FEED_MAPPINGS = [
  { mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', symbol: 'AAPL', underlying: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688', token: '978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675' },
  { mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', symbol: 'MSFT', underlying: 'd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1', token: 'bb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5' },
  { mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', symbol: 'NVDA', underlying: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593', token: '4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f' },
] as const;
export const PYTH_MAPPED_MINTS: readonly string[] = PYTH_FEED_MAPPINGS.map(mapping => mapping.mint);

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

/**
 * Bounded integer arithmetic, rounded down to eight decimal places. Context only:
 * the ratio does not claim that an xStock token unit equals an underlying share.
 */
export function pythRatio(token: Pick<PythObservation, 'price' | 'exponent'>, underlying: Pick<PythObservation, 'price' | 'exponent'>): string {
  for (const observation of [token, underlying]) {
    if (!observation || typeof observation.price !== 'string' || !/^[1-9][0-9]{0,18}$/.test(observation.price)
      || BigInt(observation.price) > 9_223_372_036_854_775_807n
      || !Number.isInteger(observation.exponent) || Math.abs(observation.exponent) > 12) throw new Error('Invalid Pyth ratio.');
  }
  const scale = 8n;
  const commonExponent = Math.min(token.exponent, underlying.exponent);
  const adjustedNumerator = BigInt(token.price) * 10n ** BigInt(token.exponent - commonExponent);
  const adjustedDenominator = BigInt(underlying.price) * 10n ** BigInt(underlying.exponent - commonExponent);
  const scaled = adjustedNumerator * 10n ** scale / adjustedDenominator;
  const digits = scaled.toString().padStart(Number(scale) + 1, '0');
  const whole = digits.slice(0, -Number(scale));
  const fraction = digits.slice(-Number(scale)).replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}

const timestamp = z.iso.datetime();
const positiveInteger = z.string().check(z.regex(/^[1-9][0-9]{0,18}$/));
const unsignedInteger = z.string().check(z.regex(/^(0|[1-9][0-9]{0,19})$/));
const decimal = z.string().check(z.maxLength(40), z.regex(/^\d+(\.\d+)?$/));
const ratioDecimal = z.string().check(z.maxLength(52), z.regex(/^\d+(\.\d{1,8})?$/));
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
  comparison: z.enum(['not-comparable', 'cross-feed-context']),
  comparisonRatio: z.optional(ratioDecimal),
  message: z.optional(text),
}).check(z.superRefine((value, context) => {
  if (value.underlying?.kind === 'token' || value.token?.kind === 'underlying'
    || (['success', 'partial', 'stale'].includes(value.state) !== Boolean(value.underlying || value.token))
    || (value.state === 'success' && (value.underlying?.state !== 'fresh' || value.token?.state !== 'fresh'))
    || (value.comparison === 'cross-feed-context' && (value.state !== 'success' || !value.comparisonRatio || !value.underlying || !value.token))
    || (value.comparison === 'not-comparable' && value.comparisonRatio !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Inconsistent market reference.' });
  }
  if (value.comparison === 'cross-feed-context' && value.underlying && value.token) {
    // Nested refinements may still run when a field failed its own validation.
    try {
      if (value.comparisonRatio !== pythRatio(value.token, value.underlying)) context.addIssue({ code: 'custom', message: 'Inconsistent reference ratio.' });
    } catch { context.addIssue({ code: 'custom', message: 'Invalid reference ratio inputs.' }); }
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

/** Only the pinned, mapped assets require Pyth; unrelated catalog assets remain usable. */
export function pythReferencesReady(data: unknown, mints: readonly string[], now = Date.now()): boolean {
  const requested = PYTH_FEED_MAPPINGS.filter(mapping => mints.includes(mapping.mint));
  if (!requested.length) return true;
  if (!Number.isFinite(now)) return false;
  const parsed = marketReferenceResponseSchema.safeParse(data);
  if (!parsed.success) return false;
  return requested.every(mapping => {
    const item = parsed.data.items.find(item => item.mint === mapping.mint);
    return item?.state === 'success' && item.underlying?.state === 'fresh' && item.token?.state === 'fresh'
      && item.underlying.feedId === mapping.underlying && item.token.feedId === mapping.token
      && isPythObservationFresh(item.underlying, now) && isPythObservationFresh(item.token, now);
  });
}
