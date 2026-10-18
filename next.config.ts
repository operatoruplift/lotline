import type { NextConfig } from 'next';

/**
 * The browser talks only to this origin, when accounts are configured to
 * Supabase, and when CAPTCHA is on to Cloudflare Turnstile. Everything else — Jupiter quotes, RPC reads — happens server-side,
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
  // Mobile Wallet Adapter (Seeker, Android) associates with the wallet app over
  // a WebSocket to localhost on an ephemeral port; nothing else leaves the origin.
  const connect = ["'self'", supabaseOrigin, 'ws://localhost:*'].filter(Boolean).join(' ');
  // Cloudflare Turnstile, only while the CAPTCHA site key is set (the same check as
  // lib/supabase/captcha.ts): its script, and the frame its challenge runs in.
  const turnstile = /^[0-9A-Za-z_-]{1,100}$/.test(process.env.NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY?.trim() ?? '') ? ' https://challenges.cloudflare.com' : '';
  return [
    "default-src 'self'",
    // Next.js ships an inline bootstrap script; styles are inlined by the build.
    // Turbopack development code uses eval for its source maps. Production
    // scripts never need this exception.
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}${turnstile}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self' data:",
    // The PWA registers a service worker from this origin.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `connect-src ${connect}`,
    ...(turnstile ? [`frame-src${turnstile}`] : []),
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
  images: {
    localPatterns: [
      { pathname: '**', search: '' },
      { pathname: '/brand-kit/**', search: '?v=sculpture-2' },
    ],
  },
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
