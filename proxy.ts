import { NextResponse, type NextRequest } from 'next/server';

/**
 * Markets ship dark. The root loading boundary streams before a page can call
 * notFound(), which would answer 200; this answers a real 404 first. It matches
 * only /markets, so no other route passes through it.
 */
export function proxy(request: NextRequest) {
  if (process.env.LOTLINE_MARKETS_ENABLED?.trim() === 'true') return NextResponse.next();
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

export const config = { matcher: ['/markets', '/markets/:path*'] };
