import { ENRICHMENT_MAX_AGE_MS, type AssetDetailsResponse } from './enrichment';

/** Keep a displayed snapshot honest even when the panel stays open without a request. */
export function contextAt(response: AssetDetailsResponse, now: number): AssetDetailsResponse {
  if (!response.details) return response;
  const timestamp = Date.parse(response.details.snapshotFetchedAt ?? '');
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000) {
    const details = { ...response.details }; delete details.liquidityUsd;
    return { ...response, state:'partial', details, message:'Recent dated mint liquidity is unavailable.' };
  }
  if (now - timestamp < ENRICHMENT_MAX_AGE_MS) return response;
  const details = { ...response.details }; delete details.liquidityUsd;
  return { ...response, state:'stale', details, message:'Tokens’ provider snapshot is older than 15 minutes. Liquidity is omitted.' };
}
