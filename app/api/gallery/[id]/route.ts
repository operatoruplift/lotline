import { z } from 'zod';
import { safeMessage } from '@/lib/server/common';
import { galleryEnabled, readPublishedPlan } from '@/lib/server/gallery';
import { enforceReadRateLimit, GALLERY_READ_BUDGET, isRateLimited, readFailure } from '@/lib/server/read-limits';
import { noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!galleryEnabled()) return Response.json({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, { status: 404, headers: noStore });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ state: 'invalid-input', message: 'Choose a shared plan.' }, { status: 400, headers: noStore });
  try {
    await enforceReadRateLimit(request, GALLERY_READ_BUDGET);
    const plan = await readPublishedPlan(id.data);
    if (plan === 'unavailable') return Response.json({ state: 'unavailable', message: 'Community plans are temporarily unavailable.' }, { status: 503, headers: noStore });
    if (!plan) return Response.json({ state: 'not-found', message: 'This plan is no longer shared.' }, { status: 404, headers: noStore });
    return Response.json({ state: 'success', plan }, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    return Response.json({ state: 'unavailable', message: isRateLimited(error) ? safeMessage(error) : 'Community plans are temporarily unavailable.' }, readFailure(error, 503));
  }
}
