import { z } from 'zod';

/** Context freshness is separate from the planner's much shorter quote lifetime. */
export const ENRICHMENT_MAX_AGE_MS = 15 * 60_000;
const text = z.string().trim().min(1).max(200);
const timestamp = z.iso.datetime();
const canonicalId = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/);

export const assetDetailsResponseSchema = z.object({
  state: z.enum(['success', 'partial', 'stale', 'unavailable', 'configuration-required', 'invalid-input']),
  network: z.literal('solana'),
  mint: z.string().max(44),
  source: z.literal('tokens.xyz'),
  details: z.object({
    canonicalId,
    canonicalName: text.optional(),
    representation: text.optional(),
    kind: text.optional(),
    issuer: text.optional(),
    liquidityUsd: z.number().finite().nonnegative().optional(),
    /** Tokens' provider snapshot retrieval time; not an observation time. */
    snapshotFetchedAt: timestamp.optional(),
    /** Optional trade-metrics observation time; not a liquidity timestamp. */
    activityAsOf: timestamp.optional(),
    sourceUrl: z.url().max(350),
    advisory: z.object({ status: z.string().min(1).max(40), reason: z.string().min(1).max(500) }).strict().optional(),
  }).strict().nullable(),
  message: z.string().max(300).optional(),
}).strict().superRefine((value, context) => {
  const hasData = ['success', 'partial', 'stale'].includes(value.state);
  if (hasData !== Boolean(value.details)) context.addIssue({ code: 'custom', message: 'Inconsistent context availability.' });
  if (!value.details) return;
  const expectedUrl = `https://tokens.xyz/${encodeURIComponent(value.details.canonicalId)}?solana=${encodeURIComponent(value.mint)}`;
  if (value.details.sourceUrl !== expectedUrl) context.addIssue({ code: 'custom', message: 'Context source does not match the requested mint.' });
  if (value.state === 'success' && (value.details.liquidityUsd === undefined || !value.details.snapshotFetchedAt)) context.addIssue({ code: 'custom', message: 'A complete snapshot needs dated mint liquidity.' });
  if (value.state === 'stale' && value.details.liquidityUsd !== undefined) context.addIssue({ code: 'custom', message: 'Stale context must not present current liquidity.' });
});

export type AssetDetailsResponse = z.infer<typeof assetDetailsResponseSchema>;
export type AssetDetails = NonNullable<AssetDetailsResponse['details']>;
