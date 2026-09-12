import { expect, it } from 'vitest';
import { contextAt } from '@/lib/domain/enrichment-freshness';
import type { AssetDetailsResponse } from '@/lib/domain/enrichment';
const time=1_800_000_000_000;
const response:AssetDetailsResponse={state:'success',network:'solana',mint:'fixture',source:'tokens.xyz',details:{canonicalId:'fixture',liquidityUsd:42,snapshotFetchedAt:new Date(time).toISOString(),sourceUrl:'https://tokens.xyz/fixture?solana=fixture'}};
it('removes liquidity at the exact display expiry without renewing timestamps or changing the source',()=>{
 expect(contextAt(response,time+899_999)).toBe(response);
 const stale=contextAt(response,time+900_000);
 expect(stale.state).toBe('stale');expect(stale.details?.liquidityUsd).toBeUndefined();expect(stale.details?.snapshotFetchedAt).toBe(response.details?.snapshotFetchedAt);expect(response.details?.liquidityUsd).toBe(42);
});
it('does not present undated or future liquidity',()=>{
 const undated={...response,details:{...response.details!,snapshotFetchedAt:undefined}};
 expect(contextAt(undated,time).details?.liquidityUsd).toBeUndefined();expect(contextAt(response,time-60_001).state).toBe('partial');
});
