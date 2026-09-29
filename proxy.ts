import { NextResponse, type NextRequest } from 'next/server';

/**
 * Unreleased surfaces ship dark. The root loading boundary streams before a page
 * can call notFound(), which would answer 200; this answers a real 404 first.
 * It matches only /markets, /portfolio and /plans, so no other route passes through it.
 */
export function proxy(request: NextRequest) {
  const gallery = request.nextUrl.pathname === '/plans' || request.nextUrl.pathname.startsWith('/plans/');
  const flag = gallery ? process.env.LOTLINE_GALLERY_ENABLED : process.env.LOTLINE_MARKETS_ENABLED;
  if (flag?.trim() === 'true') return NextResponse.next();
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

export const config = { matcher: ['/markets', '/markets/:path*', '/portfolio', '/plans', '/plans/:path*'] };
