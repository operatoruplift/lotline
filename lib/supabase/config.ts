/** Only public project credentials belong here. A secret key is rejected even if misnamed. */
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !key.startsWith('sb_publishable_')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return null;
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null;
    return { url: parsed.origin, key };
  } catch { return null; }
}

/** Enable only after signup and recovery email delivery has been verified. */
export function authEmailEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED === 'true';
}
