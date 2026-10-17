import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { clientAddress, hashedLabel } from './client-address';
import { ServiceError } from './common';
import { noStore } from './requests';

/**
 * Per-connection budgets for the unauthenticated read routes.
 *
 * Every Live read reserves a slot from one globally shared provider row
 * (`lotline_provider_limits`), so a caller who forces cache misses (a fresh
 * `owner`, or a budget differing by one micro-USDC) can drain the backlog and
 * leave every other visitor with "Live services are busy". Planning itself is
 * unaffected: normal use is a handful of reads per minute, far below this.
 * Cheaper public reads (a session check, a shared plan, the catalog) have their
 * own buckets so a flood of one never costs the others their budget.
 */
export interface ReadBudget {
  /** Names the shared bucket; one per family of routes. */
  readonly scope: string;
  readonly perIp: number;
  readonly global: number;
  /**
   * Applied per instance when the shared bucket cannot answer. Instances are
   * created freely under load, so the ordinary per-instance ceiling is close to
   * no ceiling at all; a degraded limiter for provider reads has to be stricter
   * than the healthy one, not merely present.
   */
  readonly degradedPerIp: number;
}

const WINDOW_SECONDS = 60;
const MAX_TRACKED_KEYS = 2_048;
/** Reads that spend provider allowance: quotes, holdings, units, markets, references, venue prices, token context. */
export const LIVE_READ_BUDGET: ReadBudget = { scope: 'live-read', perIp: 40, global: 1_200, degradedPerIp: 12 };
/** One revalidation of the session cookie with Supabase Auth. */
export const SESSION_READ_BUDGET: ReadBudget = { scope: 'session-read', perIp: 60, global: 3_000, degradedPerIp: 60 };
/** One shared plan, served from the edge for most readers. */
export const GALLERY_READ_BUDGET: ReadBudget = { scope: 'gallery-read', perIp: 60, global: 3_000, degradedPerIp: 60 };
/** The dated catalog snapshot, cached on the server and at the edge. */
export const CATALOG_READ_BUDGET: ReadBudget = { scope: 'catalog-read', perIp: 60, global: 3_000, degradedPerIp: 60 };
/** Answer headers for a refused request: never cached, and the window tells the client when to retry. */
export const RATE_LIMITED_HEADERS = { ...noStore, 'Retry-After': String(WINDOW_SECONDS) };

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
  new ServiceError('unavailable', 'Too many requests from this connection. Wait a moment, then retry.', 'rate-limited');

/** True for the limiter's own refusal, which routes answer with 429 rather than a 503 that reads as an outage. */
export function isRateLimited(error: unknown): boolean {
  return error instanceof ServiceError && error.reasonCode === 'rate-limited';
}

/**
 * Throws when the caller has exhausted its budget. The shared bucket is what
 * actually protects the provider allowance, since each Vercel instance holds its
 * own memory; the in-process bucket is a cheap first stop. A database failure
 * leaves the in-process bucket in force rather than taking Live planning down.
 */
export async function enforceReadRateLimit(request: Request, budget: ReadBudget = LIVE_READ_BUDGET): Promise<void> {
  const ip = clientAddress(request);
  if (!consumeLocal(`${budget.scope}:${ip}`, budget.perIp)) throw busy();
  const degraded = () => { if (!consumeLocal(`${budget.scope}-degraded:${ip}`, budget.degradedPerIp)) throw busy(); };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret?.startsWith('sb_secret_')) { degraded(); return; }

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
    const hash = hashedLabel(label);
    if (!hash) return null;
    try {
      const { data, error } = await db.rpc('lotline_consume_guest_execution_ip_slot', {
        p_ip_hash: hash,
        p_limit: limit,
        p_window_seconds: WINDOW_SECONDS,
      });
      // null means "could not decide", which is answered by the degraded ceiling
      // rather than by taking Live planning down.
      return error ? null : data === true;
    } catch {
      return null;
    }
  };
  // The global bucket goes first. A client cycling through addresses passes a
  // fresh per-IP bucket every time; checked the other way round, each pass would
  // both drain the shared budget and add a row to the bucket table.
  const global = await consume(`${budget.scope}:global`, budget.global);
  if (global === false) throw busy();
  if (global === null) { degraded(); return; }
  const perIp = await consume(`${budget.scope}:ip:${ip}`, budget.perIp);
  if (perIp === false) throw busy();
  if (perIp === null) degraded();
}
