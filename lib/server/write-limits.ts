import 'server-only';
import { createHmac } from 'node:crypto';
import { adminSupabase } from '../supabase/admin';

/**
 * Per-connection budgets for account and community writes. The same two layers
 * as the Live reads (read-limits.ts): a window in this instance, then the
 * shared bucket in the database, keyed by a salted hash so no address is stored.
 */
export type WriteAction = 'account-delete' | 'plan-report';
const BUDGETS: Record<WriteAction, { limit: number; windowSeconds: number }> = {
  'account-delete': { limit: 5, windowSeconds: 600 },
  'plan-report': { limit: 20, windowSeconds: 600 },
};
const MAX_TRACKED_KEYS = 2_048;
const windows = new Map<string, { startedAt: number; count: number }>();

function consumeLocal(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  if (windows.size >= MAX_TRACKED_KEYS) {
    for (const [candidate, window] of windows) if (now - window.startedAt >= windowSeconds * 1_000) windows.delete(candidate);
    if (windows.size >= MAX_TRACKED_KEYS) windows.delete(windows.keys().next().value as string);
  }
  const current = windows.get(key);
  if (!current || now - current.startedAt >= windowSeconds * 1_000) { windows.set(key, { startedAt: now, count: 1 }); return true; }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

/** The platform-normalized address. A client-supplied forwarded chain is never trusted. */
function address(request: Request): string {
  return request.headers.get('x-real-ip')?.trim() || 'edge-unknown';
}

/** A salted hash of the connection for one purpose. Null without the server secret. */
export function connectionHash(request: Request, purpose: string): string | null {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret?.startsWith('sb_secret_')) return null;
  return createHmac('sha256', secret).update(`${purpose}:ip:${address(request)}`).digest('hex');
}

/**
 * False once this connection has used its budget. Without the shared bucket, or
 * when the database cannot answer, the window in this instance still applies.
 */
export async function allowWrite(request: Request, action: WriteAction): Promise<boolean> {
  const { limit, windowSeconds } = BUDGETS[action];
  if (!consumeLocal(`${action}:${address(request)}`, limit, windowSeconds)) return false;
  const db = adminSupabase();
  const key = connectionHash(request, action);
  if (!db || !key) return true;
  try {
    const { data, error } = await db.rpc('lotline_consume_guest_execution_ip_slot', { p_ip_hash: key, p_limit: limit, p_window_seconds: windowSeconds });
    return error ? true : data === true;
  } catch { return true; }
}
