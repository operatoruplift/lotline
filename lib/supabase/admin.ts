import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * The server's secret-key client, for the few writes a member's own session
 * cannot make: deleting their account, a guest's report and the shared rate
 * buckets. Null when the project URL or a current sb_secret_ key is missing.
 */
export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret?.startsWith('sb_secret_')) return null;
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000) }),
    },
  });
}
