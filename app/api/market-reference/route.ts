import { readSmallJson } from '@/lib/server/common';
import { isUnmappedPythSelection } from '@/lib/domain/market-reference';
import { emptyMarketReference, getMarketReferences, marketReferenceRequestSchema } from '@/lib/server/pyth';
import { noStore, optionalHttpStatus } from '@/lib/server/requests';

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
  // fault, and neither is a selection with no pinned Pyth feed: both bodies state a
  // complete determination about a supported request. Answering 503 logged an error
  // on every page view and reads as an outage in a reviewer's network tab. Genuine
  // upstream failures - timeout, rate limit, unverified payload - keep their 5xx,
  // and a selection outside the catalog keeps its 400.
  const determined = response.state === 'unavailable' && isUnmappedPythSelection(mints);
  return Response.json(response, { status: determined ? 200 : optionalHttpStatus(response.state), headers: noStore });
}
