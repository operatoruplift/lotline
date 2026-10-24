import { ACCOUNT_REAUTH_MESSAGE } from '@/lib/client/account';
import { noStore } from '@/lib/server/requests';
import { authenticatedWithin, REAUTH_WINDOW_SECONDS } from '@/lib/server/session-freshness';
import { allowWrite } from '@/lib/server/write-limits';
import { adminSupabase } from '@/lib/supabase/admin';
import { isSameOriginMutation } from '@/lib/supabase/plans';
import { serverSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const unavailable = () => reply({ state: 'unavailable', message: 'Your account could not be deleted right now. Nothing was removed. Please try again.' }, 503);

/** Only the failure's class, status and code reach the log: never who was deleting, or any address. */
function logFailure(error: unknown) {
  const { name, status, code } = (error && typeof error === 'object' ? error : {}) as { name?: unknown; status?: unknown; code?: unknown };
  console.error('[account] deletion failed', { name: typeof name === 'string' ? name : typeof error, status: typeof status === 'number' ? status : undefined, code: typeof code === 'string' ? code : undefined });
}

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
    // A live session is not enough: the sign-in itself must be recent, so a cookie that
    // leaked days ago cannot delete the account. getSession reads the token getUser just validated.
    const { data: current } = await supabase.auth.getSession();
    const token = current.session?.access_token;
    if (!token || !authenticatedWithin(token, REAUTH_WINDOW_SECONDS)) return reply({ state: 'reauth-required', code: 'reauth_required', message: ACCOUNT_REAUTH_MESSAGE }, 403);
    const admin = adminSupabase();
    if (!admin) return reply({ state: 'configuration-required', message: 'Account deletion is not set up on this deployment yet. Nothing was removed.' }, 503);
    const { error: deletion } = await admin.auth.admin.deleteUser(data.user.id);
    if (deletion) { logFailure(deletion); return unavailable(); }
    return reply({ state: 'deleted' });
  } catch (error) { logFailure(error); return unavailable(); }
}
