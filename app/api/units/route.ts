import { getUnits } from '@/lib/server/holdings';
import { readSmallJson, safeMessage, ServiceError } from '@/lib/server/common';
import { httpStatus, noStore, unitsRequestSchema } from '@/lib/server/requests';
import { enforceReadRateLimit } from '@/lib/server/read-limits';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    await enforceReadRateLimit(request);
    const parsed = unitsRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new ServiceError('invalid-input', 'Choose up to three unique verified mints with bounded raw token amounts.');
    const body = await getUnits(parsed.data.items);
    return Response.json(body, { status: httpStatus(body.state), headers: noStore });
  } catch (error) { const state = error instanceof ServiceError ? error.kind : 'unavailable'; return Response.json({ state, items: [], message: safeMessage(error) }, { status: httpStatus(state), headers: noStore }); }
}
