import { readSmallJson, safeMessage, ServiceError } from '@/lib/server/common';
import { getQuotes } from '@/lib/server/quotes';
import { httpStatus, noStore, quotesRequestSchema } from '@/lib/server/requests';
import { enforceReadRateLimit } from '@/lib/server/read-limits';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await enforceReadRateLimit(request);
    const parsed = quotesRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new ServiceError('invalid-input', 'Choose up to three unique verified mints and a total amount no greater than 1,000,000 USDC.');
    const body = await getQuotes(parsed.data.items);
    return Response.json(body, { status: httpStatus(body.state), headers: noStore });
  } catch (error) { const state = error instanceof ServiceError ? error.kind : 'unavailable'; return Response.json({ state, quotes: [], message: safeMessage(error) }, { status: httpStatus(state), headers: noStore }); }
}
