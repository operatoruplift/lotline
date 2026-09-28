import { z } from 'zod';
import { readSmallJson } from '@/lib/server/common';
import { galleryEnabled } from '@/lib/server/gallery';
import { noStore } from '@/lib/server/requests';
import { isSameOriginMutation } from '@/lib/supabase/plans';
import { serverSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const body = z.object({ id: z.uuid() }).strict();

/** Counts a copy for a signed-in member. A guest's copy still opens; it just isn't counted. */
export async function POST(request: Request) {
  if (!galleryEnabled()) return Response.json({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, { status: 404, headers: noStore });
  if (!isSameOriginMutation(request)) return Response.json({ state: 'forbidden', message: 'Reload Lotline before copying a plan.' }, { status: 403, headers: noStore });
  try {
    const parsed = body.safeParse(await readSmallJson(request));
    if (!parsed.success) return Response.json({ state: 'invalid-input', message: 'Choose a shared plan.' }, { status: 400, headers: noStore });
    const supabase = await serverSupabase();
    if (!supabase) return Response.json({ state: 'success', counted: false }, { headers: noStore });
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return Response.json({ state: 'success', counted: false }, { headers: noStore });
    const { data, error } = await supabase.rpc('lotline_record_plan_copy', { p_id: parsed.data.id });
    if (error?.code === 'P0002') return Response.json({ state: 'not-found', message: 'This plan is no longer shared.' }, { status: 404, headers: noStore });
    if (error || typeof data !== 'number') return Response.json({ state: 'success', counted: false }, { headers: noStore });
    return Response.json({ state: 'success', counted: true, copies: data }, { headers: noStore });
  } catch { return Response.json({ state: 'success', counted: false }, { headers: noStore }); }
}
