import * as z from 'zod/mini';
import type { DataFailureReason, State } from './types';

/**
 * Meteora Dynamic Bonding Curve, read-only.
 *
 * DBC launches a brand-new token from a curve and prices it in a quote token. The
 * base token is always a fresh mint the program initializes, so an xStock can
 * never be the base side; since DBC 0.2.1 (September 9, 2026) an xStock can be the
 * QUOTE side, allowed by an operator-created TokenBadge. Lotline therefore reads
 * the launch pairs that price new tokens in a selected xStock: badge, curve
 * configs, pool state, curve progress and a pure SDK swap estimate. The USDC to
 * xStock estimate continues to come from Jupiter.
 *
 * Program: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN (IDL 0.2.1, SDK 1.5.13).
 * Docs: https://docs.meteora.ag/developer-guides/dbc/index.md and
 * https://docs.meteora.ag/core-products/dbc/accounts-and-permissions.md.
 */
export const DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const DBC_IDL_VERSION = '0.2.1';
export const DBC_SDK_VERSION = '1.5.13';
export const DBC_SOURCE_LABEL = 'Meteora DBC';
/** Discovery spends spaced getProgramAccounts calls, so one request stays small. */
export const DBC_MAX_ITEMS = 2;
/** Configs listed for one asset in one request; a larger population reports 'partial'. */
export const DBC_MAX_CONFIGS = 10;
/** Configs whose pools are read in one request. */
export const DBC_POOL_LOOKUPS = 3;
/** Pools reported per asset, largest verified quote reserve first. */
export const DBC_MAX_POOLS = 3;
/** Pool state changes with every swap, so a read is labelled for 30 seconds. */
export const DBC_FRESHNESS_MS = 30_000;
/** Anchor account discriminators from the pinned IDL. */
export const DBC_DISCRIMINATORS = {
  poolConfig: [26, 108, 14, 123, 116, 230, 129, 43],
  configWithTransferHook: [40, 220, 194, 251, 41, 199, 123, 253],
  virtualPool: [213, 224, 5, 209, 98, 69, 119, 92],
  transferHookPool: [237, 219, 184, 23, 42, 189, 169, 35],
  tokenBadge: [116, 219, 204, 229, 249, 116, 255, 150],
} as const;
/** Byte offsets used by memcmp filters and the discovery data slice. */
export const DBC_OFFSETS = {
  discriminator: 0,
  configQuoteMint: 8,
  poolConfig: 72,
  poolCreator: 104,
  poolBaseMint: 136,
  poolBaseReserve: 232,
  poolQuoteReserve: 240,
  poolSqrtPrice: 280,
  poolActivationPoint: 296,
  poolIsMigrated: 305,
} as const;
export const DBC_POOL_SLICE = { offset: DBC_OFFSETS.poolBaseMint, length: 176 } as const;
export const DBC_ACCOUNT_SIZES = { virtualPool: 424, transferHookPool: 424, poolConfig: 1048, configWithTransferHook: 1128, tokenBadge: 168 } as const;
/** Curve fees are stored against this denominator. */
export const DBC_FEE_DENOMINATOR = 1_000_000_000n;

export type DbcConfigKind = 'pool-config' | 'config-with-transfer-hook';
export type DbcPointKind = 'slot' | 'timestamp';
export type DbcFeeSide = 'input' | 'output';
export type DbcItemState = 'success' | 'partial' | 'unavailable';

export type DbcSwapEstimate = {
  /** Raw xStock units offered to the curve: the Jupiter leg's output. */
  amountInRaw: string;
  /** Raw xStock units the curve applies after its own fee. */
  netAmountInRaw: string;
  outRaw: string;
  minimumOutRaw: string;
  feeRaw: string;
  feeBps: number;
  feeMint: string;
  feeSide: DbcFeeSide;
  currentPoint: string;
  pointKind: DbcPointKind;
};
export type DbcPool = {
  pool: string;
  config: string;
  configKind: DbcConfigKind;
  baseMint: string;
  baseDecimals: number;
  quoteReserveRaw: string;
  baseReserveRaw: string;
  migrationQuoteThresholdRaw: string;
  progressBps: number;
  sqrtPrice: string;
  activationPoint: string;
  migrated: boolean;
  cliffFeeBps: number;
  estimate?: DbcSwapEstimate;
  message?: string;
};
export type DbcItem = {
  mint: string;
  state: DbcItemState;
  /** True when the DBC program holds a TokenBadge for this mint. */
  quoteToken: boolean;
  badgeAccount: string;
  configCount: number;
  configsProbed: number;
  pools: DbcPool[];
  source: string;
  slot: number;
  fetchedAt: string;
  expiresAt: string;
  reasonCode?: DataFailureReason;
  message?: string;
};
export type DbcResponse = {
  source: 'meteora-dbc';
  program: string;
  state: State;
  items: DbcItem[];
  fetchedAt: string;
  expiresAt: string;
  message?: string;
};

export function abbreviateAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}
/** Every reported read names the program it came from. */
export function dbcSourceLabel(pool?: string): string {
  return pool ? `${DBC_SOURCE_LABEL} · pool ${abbreviateAddress(pool)}` : `${DBC_SOURCE_LABEL} · program ${abbreviateAddress(DBC_PROGRAM_ID)}`;
}
/** Integer basis points of the migration threshold, rounded down and clamped. */
export function dbcProgressBps(quoteReserveRaw: string, migrationQuoteThresholdRaw: string): number {
  if (!isRaw(quoteReserveRaw) || !isRaw(migrationQuoteThresholdRaw)) throw new Error('Invalid DBC curve progress inputs.');
  const threshold = BigInt(migrationQuoteThresholdRaw);
  if (threshold <= 0n) throw new Error('Invalid DBC curve progress inputs.');
  const reserve = BigInt(quoteReserveRaw);
  const bps = reserve * 10_000n / threshold;
  return Number(bps > 10_000n ? 10_000n : bps);
}
/** Basis points of the side the curve charged, rounded down. */
export function dbcFeeBps(feeRaw: string, grossRaw: string): number {
  if (!isRaw(feeRaw) || !isRaw(grossRaw) || BigInt(grossRaw) <= 0n) throw new Error('Invalid DBC fee inputs.');
  const bps = BigInt(feeRaw) * 10_000n / BigInt(grossRaw);
  return Number(bps > 10_000n ? 10_000n : bps);
}
/** The configured cliff fee as basis points of the curve's fee denominator. */
export function dbcCliffFeeBps(cliffFeeNumerator: string): number {
  if (!isRaw(cliffFeeNumerator)) throw new Error('Invalid DBC fee inputs.');
  const bps = BigInt(cliffFeeNumerator) * 10_000n / DBC_FEE_DENOMINATOR;
  return Number(bps > 10_000n ? 10_000n : bps);
}
function isRaw(value: string): boolean {
  return typeof value === 'string' && value.length <= 40 && /^(0|[1-9][0-9]*)$/.test(value);
}

/**
 * Positive statements of what this read is. DBC hosts new tokens priced in an
 * xStock; it does not sell the xStock, and Lotline only reads it.
 */
export const DBC_COPY = {
  role: (symbol: string) => `Meteora DBC pools use ${symbol} as their quote token to price newly launched tokens. The USDC to ${symbol} estimate still comes from Jupiter.`,
  readOnly: 'Read-only. Lotline never creates pools, signs, or routes purchases through DBC.',
  quoteToken: (symbol: string) => `${symbol} holds a Meteora DBC token badge, so DBC launch pools can quote in ${symbol}.`,
  noBadge: (symbol: string) => `The Meteora DBC program holds no token badge for ${symbol}, so DBC launch pools quote in other tokens.`,
  noPools: (symbol: string) => `Every Meteora DBC curve config that quotes in ${symbol} is listed above; the configs read in this request hold their launch pools elsewhere.`,
  thin: 'Curve reserves and prices move with every swap on the curve, so these figures describe the exact read below.',
  prestocks: 'Meteora DBC issues token badges for xStocks quote tokens. PreStocks tokens are planned from issuer identity data with Jupiter estimates.',
  scope: 'Lotline reads the DBC program directly: token badge, curve configs, pool state and a pure SDK swap estimate at one confirmed slot.',
} as const;

const timestamp = z.iso.datetime();
const address = z.string().check(z.regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/));
const raw = z.string().check(z.maxLength(40), z.regex(/^(0|[1-9][0-9]*)$/));
const text = z.string().check(z.minLength(1), z.maxLength(400));
const bps = z.number().check(z.int(), z.minimum(0), z.maximum(10_000));
const slot = z.number().check(z.int(), z.minimum(0), z.maximum(Number.MAX_SAFE_INTEGER));
const reason = z.enum(['no-route', 'issuer-halted', 'unsupported-token', 'rate-limited', 'stale-verification', 'provider-unavailable']);

export const dbcSwapEstimateSchema = z.strictObject({
  amountInRaw: raw, netAmountInRaw: raw, outRaw: raw, minimumOutRaw: raw,
  feeRaw: raw, feeBps: bps, feeMint: address, feeSide: z.enum(['input', 'output']),
  currentPoint: raw, pointKind: z.enum(['slot', 'timestamp']),
}).check(z.superRefine((value, context) => {
  const positive = BigInt(value.amountInRaw) > 0n && BigInt(value.outRaw) > 0n;
  const bounded = BigInt(value.netAmountInRaw) <= BigInt(value.amountInRaw) && BigInt(value.minimumOutRaw) <= BigInt(value.outRaw);
  const side = value.feeSide === 'input'
    ? BigInt(value.amountInRaw) - BigInt(value.netAmountInRaw) === BigInt(value.feeRaw)
    : BigInt(value.netAmountInRaw) === BigInt(value.amountInRaw);
  if (!positive || !bounded || !side) context.addIssue({ code: 'custom', message: 'Inconsistent DBC swap estimate.' });
}));

export const dbcPoolSchema = z.strictObject({
  pool: address, config: address, configKind: z.enum(['pool-config', 'config-with-transfer-hook']),
  baseMint: address, baseDecimals: z.number().check(z.int(), z.minimum(0), z.maximum(9)),
  quoteReserveRaw: raw, baseReserveRaw: raw, migrationQuoteThresholdRaw: raw,
  progressBps: bps, sqrtPrice: raw, activationPoint: raw, migrated: z.boolean(),
  cliffFeeBps: bps, estimate: z.optional(dbcSwapEstimateSchema), message: z.optional(text),
}).check(z.superRefine((value, context) => {
  try {
    if (value.progressBps !== dbcProgressBps(value.quoteReserveRaw, value.migrationQuoteThresholdRaw)) context.addIssue({ code: 'custom', message: 'Inconsistent DBC curve progress.' });
  } catch { context.addIssue({ code: 'custom', message: 'Invalid DBC curve progress inputs.' }); }
  if (value.migrated && value.estimate) context.addIssue({ code: 'custom', message: 'A migrated curve carries no estimate.' });
}));

export const dbcItemSchema = z.strictObject({
  mint: address, state: z.enum(['success', 'partial', 'unavailable']),
  quoteToken: z.boolean(), badgeAccount: address,
  configCount: z.number().check(z.int(), z.minimum(0), z.maximum(1_000_000)),
  configsProbed: z.number().check(z.int(), z.minimum(0), z.maximum(DBC_MAX_CONFIGS)),
  pools: z.array(dbcPoolSchema).check(z.maxLength(DBC_MAX_POOLS)),
  source: z.string().check(z.minLength(1), z.maxLength(100)),
  slot, fetchedAt: timestamp, expiresAt: timestamp,
  reasonCode: z.optional(reason), message: z.optional(text),
}).check(z.superRefine((value, context) => {
  const pools = new Set(value.pools.map(pool => pool.pool));
  if (pools.size !== value.pools.length) context.addIssue({ code: 'custom', message: 'Duplicate DBC pools.' });
  if (!value.quoteToken && (value.pools.length || value.configCount)) context.addIssue({ code: 'custom', message: 'A mint without a token badge carries no DBC configs.' });
  if (value.state === 'unavailable' && value.pools.length) context.addIssue({ code: 'custom', message: 'Inconsistent DBC item state.' });
  if (value.state !== 'unavailable' && !value.pools.length) context.addIssue({ code: 'custom', message: 'Inconsistent DBC item state.' });
  if (value.configsProbed > value.configCount) context.addIssue({ code: 'custom', message: 'More configs were reported read than exist.' });
  if (!value.source.includes(DBC_SOURCE_LABEL)) context.addIssue({ code: 'custom', message: 'Every DBC read names its source.' });
  if (Date.parse(value.expiresAt) - Date.parse(value.fetchedAt) !== DBC_FRESHNESS_MS) context.addIssue({ code: 'custom', message: 'Inconsistent DBC freshness window.' });
}));

export const dbcResponseSchema = z.strictObject({
  source: z.literal('meteora-dbc'), program: z.literal(DBC_PROGRAM_ID),
  state: z.enum(['success', 'partial', 'unavailable', 'invalid-input', 'configuration-required']),
  items: z.array(dbcItemSchema).check(z.maxLength(DBC_MAX_ITEMS)),
  fetchedAt: timestamp, expiresAt: timestamp, message: z.optional(text),
}).check(z.refine(value => new Set(value.items.map(item => item.mint)).size === value.items.length));

/** A read stays labelled current only inside its own 30-second window. */
export function isDbcReadFresh(item: Pick<DbcItem, 'fetchedAt' | 'expiresAt'>, now = Date.now()): boolean {
  return Number.isFinite(now) && Date.parse(item.fetchedAt) <= now && now < Date.parse(item.expiresAt);
}
