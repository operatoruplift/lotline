import { after } from 'next/server';
import { safeMessage, ServiceError } from '@/lib/server/common';
import { marketsEnabled } from '@/lib/server/features';
import { marketStore } from '@/lib/server/markets';
import { enforceReadRateLimit } from '@/lib/server/read-limits';
import { noStore } from '@/lib/server/requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Public market context for the catalog. Shared at the edge; never user or wallet data. */
export async function GET(request: Request) {
  if (!marketsEnabled()) return Response.json({ state: 'unavailable', message: 'Markets are not enabled on this deployment.' }, { status: 404, headers: noStore });
  if (new URL(request.url).search) return Response.json({ state: 'invalid-input', message: 'This endpoint takes no parameters.' }, { status: 400, headers: noStore });
  try {
    await enforceReadRateLimit(request);
    const { snapshot, refresh } = await marketStore.read();
    // A stale snapshot is answered at once; the new read finishes after the response.
    if (refresh) after(() => refresh().catch(() => undefined));
    return Response.json(snapshot, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const limited = error instanceof ServiceError && error.reasonCode === 'rate-limited';
    return Response.json({ state: 'unavailable', message: safeMessage(error) }, { status: limited ? 429 : 503, headers: noStore });
  }
}
