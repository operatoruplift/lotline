import { noStore } from '@/lib/server/requests';
import { allowWrite } from '@/lib/server/write-limits';
import { adminSupabase } from '@/lib/supabase/admin';
import { isSameOriginMutation } from '@/lib/supabase/plans';
import { serverSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const unavailable = () => reply({ state: 'unavailable', message: 'Your account could not be deleted right now. Nothing was removed. Please try again.' }, 503);

/**
 * Deletes the signed-in member's own account with the admin API. Every Lotline
 * row that references the account goes with it (see
 * supabase/migrations/20261007090000_account_deletion.sql). The browser then
 * signs out locally. On-chain transactions are public and stay.
 */
export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return reply({ state: 'forbidden', message: 'Reload Lotline before deleting your account.' }, 403);
  if (!(await allowWrite(request, 'account-delete'))) return reply({ state: 'rate-limited', message: 'Too many attempts from this connection. Wait a few minutes, then try again.' }, 429);
  try {
    const supabase = await serverSupabase();
    if (!supabase) return reply({ state: 'configuration-required', message: 'Accounts are not available on this deployment.' }, 503);
    // getUser revalidates with Auth; the cookie alone never names the account to delete.
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401 && error.status !== 403) return unavailable();
    if (!data.user) return reply({ state: 'unauthorized', message: 'Sign in to delete your account.' }, 401);
    const admin = adminSupabase();
    if (!admin) return reply({ state: 'configuration-required', message: 'Account deletion is not set up on this deployment yet. Nothing was removed.' }, 503);
    const { error: deletion } = await admin.auth.admin.deleteUser(data.user.id);
    if (deletion) return unavailable();
    return reply({ state: 'deleted' });
  } catch { return unavailable(); }
}
