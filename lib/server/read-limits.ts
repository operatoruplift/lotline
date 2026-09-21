import 'server-only';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ServiceError } from './common';

/**
 * Per-connection budget for the unauthenticated Live read routes.
 *
 * Every Live read reserves a slot from one globally shared provider row
 * (`lotline_provider_limits`), so a caller who forces cache misses (a fresh
 * `owner`, or a budget differing by one micro-USDC) can drain the backlog and
 * leave every other visitor with "Live services are busy". Planning itself is
 * unaffected: normal use is a handful of reads per minute, far below this.
 */
const WINDOW_SECONDS = 60;
const PER_IP_LIMIT = 40;
const GLOBAL_LIMIT = 1_200;
const MAX_TRACKED_KEYS = 2_048;
/**
 * Applied per instance when the shared bucket cannot answer. Instances are
 * created freely under load, so the ordinary per-instance ceiling is close to no
 * ceiling at all; a degraded limiter has to be stricter than the healthy one,
 * not merely present.
 */
const DEGRADED_PER_IP_LIMIT = 12;

const windows = new Map<string, { startedAt: number; count: number }>();

function consumeLocal(key: string, limit: number): boolean {
  const now = Date.now();
  if (windows.size >= MAX_TRACKED_KEYS) {
    for (const [candidate, window] of windows) {
      if (now - window.startedAt >= WINDOW_SECONDS * 1_000) windows.delete(candidate);
    }
    if (windows.size >= MAX_TRACKED_KEYS) windows.delete(windows.keys().next().value as string);
  }
  const current = windows.get(key);
  if (!current || now - current.startedAt >= WINDOW_SECONDS * 1_000) {
    windows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

const busy = () =>
  new ServiceError('unavailable', 'Too many live reads from this connection. Wait a moment, then retry.', 'rate-limited');

/**
 * Throws when the caller has exhausted its budget. The shared bucket is what
 * actually protects the provider allowance, since each Vercel instance holds its
 * own memory; the in-process bucket is a cheap first stop. A database failure
 * leaves the in-process bucket in force rather than taking Live planning down.
 */
export async function enforceReadRateLimit(request: Request): Promise<void> {
  // Platform-normalized address only. A client-supplied forwarded chain is not
  // trusted, and when it is absent every such caller shares one bucket.
  const ip = request.headers.get('x-real-ip')?.trim() || 'edge-unknown';
  if (!consumeLocal(`read:${ip}`, PER_IP_LIMIT)) throw busy();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret?.startsWith('sb_secret_')) {
    if (!consumeLocal(`read-degraded:${ip}`, DEGRADED_PER_IP_LIMIT)) throw busy();
    return;
  }

  const db = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
          signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(4_000)]) : AbortSignal.timeout(4_000),
        }),
    },
  });
  const consume = async (label: string, limit: number): Promise<boolean | null> => {
    const hash = createHmac('sha256', secret).update(label).digest('hex');
    try {
      const { data, error } = await db.rpc('lotline_consume_guest_execution_ip_slot', {
        p_ip_hash: hash,
        p_limit: limit,
        p_window_seconds: WINDOW_SECONDS,
      });
      // null means "could not decide", which is answered by the degraded ceiling
      // below rather than by taking Live planning down.
      return error ? null : data === true;
    } catch {
      return null;
    }
  };
  const perIp = await consume(`live-read:ip:${ip}`, PER_IP_LIMIT);
  if (perIp === false) throw busy();
  if (perIp === null) {
    if (!consumeLocal(`read-degraded:${ip}`, DEGRADED_PER_IP_LIMIT)) throw busy();
    return;
  }
  if ((await consume('live-read:global', GLOBAL_LIMIT)) === false) throw busy();
}
