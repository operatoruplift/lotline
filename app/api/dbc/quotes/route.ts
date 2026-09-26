import { readSmallJson, safeMessage, ServiceError } from '@/lib/server/common';
import { dbcRequestSchema, dbcResponse, getDbcPairs } from '@/lib/server/meteora-dbc';
import { noStore, optionalHttpStatus } from '@/lib/server/requests';
import { enforceReadRateLimit } from '@/lib/server/read-limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await enforceReadRateLimit(request);
    const parsed = dbcRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new ServiceError('invalid-input', 'Choose one or two unique verified xStocks and a raw asset amount.');
    const body = await getDbcPairs(parsed.data.items);
    // A read-only context panel whose server RPC is not configured is not a server
    // fault: the body states the exact scope and the planner keeps its Jupiter
    // estimates, so answering 200 keeps a reviewer's network tab honest.
    return Response.json(body, { status: optionalHttpStatus(body.state), headers: noStore });
  } catch (error) {
    // The same holds on this path: a coordination or RPC setting that is switched
    // off states its scope in the body, while a real read failure keeps its 5xx.
    const state = error instanceof ServiceError ? error.kind : 'unavailable';
    return Response.json(dbcResponse([], state, safeMessage(error)), { status: optionalHttpStatus(state), headers: noStore });
  }
}
