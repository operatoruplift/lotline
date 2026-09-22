import { readSmallJson } from '@/lib/server/common';
import { emptyMarketReference, getMarketReferences, marketReferenceRequestSchema } from '@/lib/server/pyth';
import { httpStatus, noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  let mints: string[];
  try {
    const parsed = marketReferenceRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new Error();
    mints = parsed.data.mints;
  } catch {
    return Response.json(emptyMarketReference([], 'invalid-input', 'Provide one to ten unique verified xStock mints.'), { status: 400, headers: noStore });
  }
  const response = await getMarketReferences(mints);
  // An optional reference panel that is deliberately switched off is not a server
  // fault. Answering 503 logged an error on every page view and reads as an outage
  // in a reviewer's network tab; the body already states the exact condition.
  const status = response.state === 'configuration-required' ? 200 : httpStatus(response.state);
  return Response.json(response, { status, headers: noStore });
}
