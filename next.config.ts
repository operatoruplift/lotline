import type { NextConfig } from 'next';
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
    ] }, { source: '/sw.js', headers: [
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Service-Worker-Allowed', value: '/' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
    ] }];
  },
};
export default config;
