import { getPreStocksUnits } from '@/lib/server/prestocks';
import { readSmallJson, safeMessage, ServiceError } from '@/lib/server/common';
import { httpStatus, noStore, unitsRequestSchema } from '@/lib/server/requests';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const parsed = unitsRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new ServiceError('invalid-input', 'Choose up to three unique verified PreStocks mints with bounded raw token amounts.');
    const body = await getPreStocksUnits(parsed.data.items);
    return Response.json(body, { status: httpStatus(body.state), headers: noStore });
  } catch (error) {
    const state = error instanceof ServiceError ? error.kind : 'unavailable';
    return Response.json({ state, items: [], message: safeMessage(error) }, { status: httpStatus(state), headers: noStore });
  }
}
