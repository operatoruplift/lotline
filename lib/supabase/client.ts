'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from './config';

export function browserSupabase() {
  const config = supabaseConfig();
  return config ? createBrowserClient(config.url, config.key, {
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) }) },
  }) : null;
}
