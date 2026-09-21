import { getPreStocksHoldings } from '@/lib/server/prestocks';
import { unavailableHoldings } from '@/lib/server/holdings';
import { httpStatus, noStore, parseMints } from '@/lib/server/requests';
import { enforceReadRateLimit } from '@/lib/server/read-limits';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {
  let mints: string[] = [];
  try {
    await enforceReadRateLimit(request);
    const params = new URL(request.url).searchParams;
    mints = parseMints(params.get('mints'));
    const body = await getPreStocksHoldings(params.get('owner') ?? '', mints);
    return Response.json(body, { status: httpStatus(body.state), headers: noStore });
  } catch (error) {
    const body = unavailableHoldings(mints, error);
    return Response.json(body, { status: httpStatus(body.state), headers: noStore });
  }
}
