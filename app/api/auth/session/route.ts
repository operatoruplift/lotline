import { enforceReadRateLimit, readFailure, SESSION_READ_BUDGET } from '@/lib/server/read-limits';
import { noStore } from '@/lib/server/requests';
import { serverSupabase } from '@/lib/supabase/server';
import { walletAddress } from '@/lib/supabase/wallet-identity';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    // Every call revalidates the cookie with Supabase Auth, so a flood of them would spend that service's allowance.
    await enforceReadRateLimit(request, SESSION_READ_BUDGET);
    const supabase = await serverSupabase();
    if (!supabase) return Response.json({ state: 'configuration-required', user: null }, { headers: noStore });
    // getUser revalidates with Auth, including deleted users; cookie contents alone never authorize.
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401 && error.status !== 403) return Response.json({ state: 'unavailable', user: null }, { status: 503, headers: noStore });
    const wallet = data.user ? walletAddress(data.user) : null;
    return Response.json({ state: data.user ? 'signed-in' : 'guest', user: data.user ? { id: data.user.id, email: data.user.email, ...(wallet ? { wallet } : {}) } : null }, { headers: noStore });
  } catch (error) { return Response.json({ state: 'unavailable', user: null }, readFailure(error, 503)); }
}
