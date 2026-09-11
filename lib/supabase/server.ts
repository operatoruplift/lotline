import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';

/** Route handlers only: cookies must be writable when a token refreshes. */
export async function serverSupabase() {
  const config = supabaseConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: entries => { for (const { name, value, options } of entries) jar.set(name, value, options); },
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) }),
    },
  });
}
