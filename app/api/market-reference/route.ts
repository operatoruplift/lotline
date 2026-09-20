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
  return Response.json(response, { status: httpStatus(response.state), headers: noStore });
}
