import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ServiceError } from './common';

const slotSchema = z.object({ allowed: z.boolean(), wait_ms: z.number().int().min(0).max(12_600) });

/** Reserves upstream start times across Vercel instances; stores no user or wallet data. */
export async function reserveProviderSlot(service: 'jupiter' | 'solana'): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const required = process.env.VERCEL === '1' || process.env.LOTLINE_SHARED_LIMITS === 'true';
  // A single local Node process already has bounded, spaced queues.
  if (!required && !key) return;
  if (!url || !key?.startsWith('sb_secret_')) throw new ServiceError('configuration-required', 'Live request coordination is not configured. Example mode is ready to use.');
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.supabase.co') || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new Error();
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.rpc('lotline_reserve_provider_slot', { provider: service }).abortSignal(AbortSignal.timeout(5000));
    const result = slotSchema.safeParse(data);
    if (error || !result.success) throw new Error();
    if (!result.data.allowed) throw new ServiceError('unavailable', 'Live services are busy. Wait a moment, then refresh.');
    if (result.data.wait_ms) await new Promise(resolve => setTimeout(resolve, result.data.wait_ms));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('unavailable', 'Live request coordination is temporarily unavailable. Please retry.');
  }
}
