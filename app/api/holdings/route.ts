import { getHoldings, unavailableHoldings } from '@/lib/server/holdings';
import { httpStatus, noStore, parseMints } from '@/lib/server/requests';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  let mints: string[] = [];
  try {
    const params = new URL(request.url).searchParams;
    mints = parseMints(params.get('mints'));
    const body = await getHoldings(params.get('owner') ?? '', mints);
    return Response.json(body, { status: httpStatus(body.state), headers: noStore });
  } catch (error) { const body = unavailableHoldings(mints, error); return Response.json(body, { status: httpStatus(body.state), headers: noStore }); }
}
