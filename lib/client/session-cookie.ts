import { supabaseConfig } from '@/lib/supabase/config';

/**
 * Whether this browser holds a Supabase session cookie. @supabase/ssr keeps the
 * session under `sb-<project ref>-auth-token`, split into `.0`, `.1`, … when it
 * is long, and the page can read it. Presence is a hint for labels only: every
 * protected read still revalidates the session with Auth.
 */
export function sessionCookieName(projectUrl: string): string | null {
  try { return `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`; } catch { return null; }
}

export function hasSessionCookie(cookieHeader: string, projectUrl: string | undefined = supabaseConfig()?.url): boolean {
  const name = projectUrl ? sessionCookieName(projectUrl) : null;
  if (!name) return false;
  return cookieHeader.split(';').some(part => {
    const [key, ...rest] = part.trim().split('=');
    return (key === name || key.startsWith(`${name}.`)) && rest.join('=').length > 0;
  });
}
