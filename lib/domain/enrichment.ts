import * as z from 'zod/mini';

/**
 * This schema is validated in the browser, so it uses zod/mini: the same
 * runtime semantics as classic zod, expressed with standalone checks instead
 * of fluent methods, and tree-shakeable down to only what is used. That keeps
 * the full zod runtime off the client's first load.
 */

/** Context freshness is separate from the planner's much shorter quote lifetime. */
export const ENRICHMENT_MAX_AGE_MS = 15 * 60_000;
const text = z.string().check(z.trim(), z.minLength(1), z.maxLength(200));
const timestamp = z.iso.datetime();
const canonicalId = z.string().check(z.minLength(1), z.maxLength(120), z.regex(/^[a-z0-9][a-z0-9._-]*$/));

const details = z.strictObject({
  canonicalId,
  canonicalName: z.optional(text),
  representation: z.optional(text),
  kind: z.optional(text),
  issuer: z.optional(text),
  liquidityUsd: z.optional(z.number().check(z.nonnegative())),
  /** Tokens' provider snapshot retrieval time; not an observation time. */
  snapshotFetchedAt: z.optional(timestamp),
  /** Optional trade-metrics observation time; not a liquidity timestamp. */
  activityAsOf: z.optional(timestamp),
  sourceUrl: z.url().check(z.maxLength(350)),
  advisory: z.optional(z.strictObject({
    status: z.string().check(z.minLength(1), z.maxLength(40)),
    reason: z.string().check(z.minLength(1), z.maxLength(500)),
  })),
});

export const assetDetailsResponseSchema = z.strictObject({
  state: z.enum(['success', 'partial', 'stale', 'unavailable', 'configuration-required', 'invalid-input']),
  network: z.literal('solana'),
  mint: z.string().check(z.maxLength(44)),
  source: z.literal('tokens.xyz'),
  details: z.nullable(details),
  message: z.optional(z.string().check(z.maxLength(300))),
}).check(z.superRefine((value, context) => {
  const hasData = ['success', 'partial', 'stale'].includes(value.state);
  if (hasData !== Boolean(value.details)) context.addIssue({ code: 'custom', message: 'Inconsistent context availability.' });
  if (!value.details) return;
  const expectedUrl = `https://tokens.xyz/${encodeURIComponent(value.details.canonicalId)}?solana=${encodeURIComponent(value.mint)}`;
  if (value.details.sourceUrl !== expectedUrl) context.addIssue({ code: 'custom', message: 'Context source does not match the requested mint.' });
  if (value.state === 'success' && (value.details.liquidityUsd === undefined || !value.details.snapshotFetchedAt)) context.addIssue({ code: 'custom', message: 'A complete snapshot needs dated mint liquidity.' });
  if (value.state === 'stale' && value.details.liquidityUsd !== undefined) context.addIssue({ code: 'custom', message: 'Stale context must not present current liquidity.' });
}));

export type AssetDetailsResponse = z.infer<typeof assetDetailsResponseSchema>;
export type AssetDetails = NonNullable<AssetDetailsResponse['details']>;
