import { serverSupabase } from '@/lib/supabase/server';
import { cloudPlanInput, cloudPlanRecord, isSameOriginMutation, planId } from '@/lib/supabase/plans';
import { readSmallJson, ServiceError } from '@/lib/server/common';
import { noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';
const columns = 'id,name,budget_raw,allocations,created_at';
function result(body: unknown, status = 200) { return Response.json(body, { status, headers: noStore }); }
async function authorized() {
  const client = await serverSupabase();
  if (!client) return { response: result({ state: 'configuration-required', message: 'Cloud plans are not configured. Your local plan is still available.' }, 503) };
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401 && error.status !== 403) return { response: unavailable() };
  if (error || !data.user) return { response: result({ state: 'unauthorized', message: 'Sign in to manage cloud plans.' }, 401) };
  return { client, user: data.user };
}
function unavailable() { return result({ state: 'unavailable', message: 'Cloud plans are temporarily unavailable. Your local plan is safe; please retry.' }, 503); }

export async function GET() {
  try {
    const auth = await authorized();
    if (auth.response) return auth.response;
    const { data, error } = await auth.client!.from('lotline_contribution_plans').select(columns).eq('user_id', auth.user!.id).order('created_at', { ascending: false }).limit(20);
    if (error) return unavailable();
    const plans = cloudPlanRecord.array().safeParse(data);
    if (!plans.success) return unavailable();
    return result({ state: 'success', plans: plans.data });
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return result({ state: 'forbidden', message: 'Reload Lotline before saving a plan.' }, 403);
  try {
    const parsed = cloudPlanInput.safeParse(await readSmallJson(request));
    if (!parsed.success) return result({ state: 'invalid-input', message: 'Use a name, a positive USDC budget, and one to three supported assets totaling 100%.' }, 400);
    const auth = await authorized();
    if (auth.response) return auth.response;
    const { data, error } = await auth.client!.from('lotline_contribution_plans').insert({ ...parsed.data, user_id: auth.user!.id }).select(columns).single();
    if (error?.code === 'P0001') return result({ state: 'limit-reached', message: 'You can keep 20 cloud plans. Delete a saved plan before adding another.' }, 409);
    if (error) return unavailable();
    const saved = cloudPlanRecord.safeParse(data);
    if (!saved.success) return unavailable();
    return result({ state: 'success', plan: saved.data }, 201);
  } catch (error) {
    if (error instanceof ServiceError && error.kind === 'invalid-input') return result({ state: 'invalid-input', message: 'Send a valid plan smaller than 4 KB.' }, 400);
    return unavailable();
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return result({ state: 'forbidden', message: 'Reload Lotline before deleting a plan.' }, 403);
  const parsed = planId.safeParse(new URL(request.url).searchParams.get('id'));
  if (!parsed.success) return result({ state: 'invalid-input', message: 'Choose a saved plan.' }, 400);
  try {
    const auth = await authorized();
    if (auth.response) return auth.response;
    const { data, error } = await auth.client!.from('lotline_contribution_plans').delete().eq('id', parsed.data).eq('user_id', auth.user!.id).select('id');
    if (error) return unavailable();
    if (!data?.length) return result({ state: 'not-found', message: 'That saved plan is no longer available.' }, 404);
    return result({ state: 'success' });
  } catch { return unavailable(); }
}
