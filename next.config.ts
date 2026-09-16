import type { NextConfig } from 'next';

/**
 * The browser talks only to this origin and, when accounts are configured, to
 * Supabase. Everything else — Jupiter quotes, RPC reads — happens server-side,
 * so connect-src can stay tight. The Supabase origin is derived rather than
 * hardcoded so a project change cannot silently break sign-in.
 */
function contentSecurityPolicy(): string {
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  let supabaseOrigin = '';
  try {
    if (supabase) supabaseOrigin = new URL(supabase).origin;
  } catch {
    supabaseOrigin = '';
  }
  const connect = ["'self'", supabaseOrigin].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    // Next.js ships an inline bootstrap script; styles are inlined by the build.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self' data:",
    // The PWA registers a service worker from this origin.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  logging: { incomingRequests: false, fetches: { fullUrl: false } },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
    ] }, { source: '/sw.js', headers: [
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Service-Worker-Allowed', value: '/' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
    ] }];
  },
};
export default config;
