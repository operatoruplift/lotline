import { z } from 'zod';
import { galleryEnabled } from '@/lib/server/gallery';
import { noStore } from '@/lib/server/requests';
import { serverSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const mine = z.array(z.object({ id: z.uuid(), plan_id: z.uuid(), display_name: z.string().nullable(), copy_count: z.number().int().min(0), published_at: z.string() }).strict()).max(5);

/** Which of the signed-in member's saved plans are shared, with their copy counts. */
export async function GET() {
  if (!galleryEnabled()) return Response.json({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, { status: 404, headers: noStore });
  try {
    const supabase = await serverSupabase();
    if (!supabase) return Response.json({ state: 'configuration-required', shared: [] }, { status: 503, headers: noStore });
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return Response.json({ state: 'unauthorized', shared: [] }, { status: 401, headers: noStore });
    const { data, error } = await supabase.rpc('lotline_my_published_plans');
    const parsed = mine.safeParse(data);
    if (error || !parsed.success) return Response.json({ state: 'unavailable', shared: [] }, { status: 503, headers: noStore });
    return Response.json({ state: 'success', shared: parsed.data }, { headers: noStore });
  } catch { return Response.json({ state: 'unavailable', shared: [] }, { status: 503, headers: noStore }); }
}
