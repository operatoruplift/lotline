import { getCatalog } from '@/lib/server/catalog';
import { safeMessage, ServiceError } from '@/lib/server/common';
import { httpStatus, noStore } from '@/lib/server/requests';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const body = await getCatalog();
    // The catalog is a dated issuer snapshot that the server itself caches for
    // an hour, so a successful response may sit at the CDN for five minutes.
    // Without this, concurrent visitors landing on separate cold instances each
    // rebuild the catalog against the public RPC — eight at once took 16–20s
    // where one takes 0.6s. Anything but success stays uncached.
    const headers = body.state === 'success' ? { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } : noStore;
    return Response.json(body, { status: httpStatus(body.state), headers });
  }
  catch (error) { const state = error instanceof ServiceError ? error.kind : 'unavailable'; return Response.json({ state, assets: [], unavailable: [], message: safeMessage(error) }, { status: httpStatus(state), headers: noStore }); }
}
