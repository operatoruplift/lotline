import { serverSupabase } from '@/lib/supabase/server';
import { noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const supabase = await serverSupabase();
    if (!supabase) return Response.json({ state: 'configuration-required', user: null }, { headers: noStore });
    // getUser revalidates with Auth, including deleted users; cookie contents alone never authorize.
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401 && error.status !== 403) return Response.json({ state: 'unavailable', user: null }, { status: 503, headers: noStore });
    return Response.json({ state: data.user ? 'signed-in' : 'guest', user: data.user ? { id: data.user.id, email: data.user.email } : null }, { headers: noStore });
  } catch { return Response.json({ state: 'unavailable', user: null }, { status: 503, headers: noStore }); }
}
