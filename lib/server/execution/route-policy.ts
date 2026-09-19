import 'server-only';
import { z } from 'zod';
import { address } from '@solana/kit';
import { addressSchema, fetchJson, ServiceError } from '@/lib/server/common';
import { reserveProviderSlot } from '@/lib/server/provider-limits';
import { RAYDIUM_CLMM_PROGRAM } from './route-semantics';

let cached: { expiresAt: number; exclusions: string } | undefined;
/** Routing preference only. Encoded instruction validation is still mandatory. */
export async function unsupportedDexLabels(apiKey?: string): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.exclusions;
  await reserveProviderSlot('jupiter');
  const result = z.record(addressSchema, z.string().min(1).max(80).refine(value => !/[\r\n,]/.test(value))).safeParse(await fetchJson('https://api.jup.ag/swap/v2/program-id-to-label', { headers: apiKey ? { 'x-api-key': apiKey } : {} }));
  if (!result.success || Object.keys(result.data).length > 500 || result.data[address(RAYDIUM_CLMM_PROGRAM)] !== 'Raydium CLMM') throw new ServiceError('unavailable', 'The supported routing preference could not be verified. Try again later.');
  const exclusions = [...new Set(Object.values(result.data).filter(label => label !== 'Raydium CLMM'))].sort().join(',');
  if (!exclusions) throw new ServiceError('unavailable', 'The provider routing catalog is incomplete.');
  cached = { exclusions, expiresAt: Date.now() + 15 * 60_000 };
  return exclusions;
}
