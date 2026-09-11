import { getCatalog } from '@/lib/server/catalog';
import { safeMessage, ServiceError } from '@/lib/server/common';
import { httpStatus, noStore } from '@/lib/server/requests';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { const body = await getCatalog(); return Response.json(body, { status: httpStatus(body.state), headers: noStore }); }
  catch (error) { const state = error instanceof ServiceError ? error.kind : 'unavailable'; return Response.json({ state, assets: [], unavailable: [], message: safeMessage(error) }, { status: httpStatus(state), headers: noStore }); }
}
