import { serverSupabase } from '@/lib/supabase/server';
import { isSameOriginMutation } from '@/lib/supabase/plans';
import { readSmallJson, ServiceError } from '@/lib/server/common';
import { noStore } from '@/lib/server/requests';
import { schedulePatchSchema, scheduleSchema } from '@/lib/server/execution/schemas';

export const dynamic = 'force-dynamic';
const columns = 'id,name,budget_raw,allocations,cadence,timezone,next_due_at,paused,plan_version,created_at,updated_at';
function result(body: unknown, status = 200) { return Response.json(body, { status, headers: noStore }); }
async function owner() {
  const client = await serverSupabase();
  if (!client) throw new ServiceError('configuration-required', 'Supabase accounts are not configured.');
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) throw new ServiceError('invalid-input', 'Sign in to save contribution reminders.');
  return { client, userId: auth.data.user.id };
}

export async function GET() {
  try { const { client, userId } = await owner(); const { data, error } = await client.from('lotline_contribution_schedules').select(columns).eq('user_id', userId).order('next_due_at', { ascending: true }).limit(50); if (error) throw new ServiceError('unavailable', 'Saved contribution reminders are temporarily unavailable.'); return result({ state: 'success', schedules: data }); }
  catch (error) { const status = error instanceof ServiceError && error.kind === 'invalid-input' ? 401 : 503; return result({ state: error instanceof ServiceError ? error.kind : 'unavailable', message: error instanceof ServiceError ? error.message : 'Saved contribution reminders are temporarily unavailable.' }, status); }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return result({ state: 'forbidden', message: 'Reload Lotline before saving a reminder.' }, 403);
  try {
    const parsed = scheduleSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return result({ state: 'invalid-input', message: 'Use a name, valid budget, 100% split, cadence, timezone, and due date.' }, 400);
    const { client, userId } = await owner();
    const { id } = parsed.data;
    const payload = { name: parsed.data.name, budget_raw: parsed.data.budgetRaw, allocations: parsed.data.allocations, cadence: parsed.data.cadence, timezone: parsed.data.timezone, next_due_at: parsed.data.nextDueAt, paused: parsed.data.paused };
    // A lost creation response must not strand a device with a stable ID but no
    // cloud acknowledgement. RLS and both filters keep retries owner-scoped.
    const updateExisting = async () => {
      const updated = await client.from('lotline_contribution_schedules').update(payload).eq('id', id!).eq('user_id', userId).select(columns).maybeSingle();
      if (updated.error || !updated.data) throw new ServiceError('unavailable', 'The contribution reminder could not be saved.');
      return result({ state: 'success', schedule: updated.data });
    };
    if (id) {
      const existing = await client.from('lotline_contribution_schedules').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
      if (existing.error) throw new ServiceError('unavailable', 'The contribution reminder could not be saved.');
      if (existing.data) return await updateExisting();
    }
    const { data, error } = await client.from('lotline_contribution_schedules').insert({ ...(id ? { id } : {}), user_id: userId, ...payload }).select(columns).single();
    if (error?.code === '23505' && id) return await updateExisting();
    if (error) throw new ServiceError('unavailable', 'The contribution reminder could not be saved.');
    return result({ state: 'success', schedule: data }, 201);
  }
  catch (error) { return result({ state: error instanceof ServiceError ? error.kind : 'unavailable', message: error instanceof ServiceError ? error.message : 'The contribution reminder could not be saved.' }, error instanceof ServiceError && error.kind === 'invalid-input' ? 400 : 503); }
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return result({ state: 'forbidden', message: 'Reload Lotline before changing a reminder.' }, 403);
  try { const parsed = schedulePatchSchema.safeParse(await readSmallJson(request)); if (!parsed.success) return result({ state: 'invalid-input', message: 'Send a valid reminder update.' }, 400); const { id, ...changes } = parsed.data; const { client, userId } = await owner(); const payload = { ...(changes.name !== undefined ? { name: changes.name } : {}), ...(changes.budgetRaw !== undefined ? { budget_raw: changes.budgetRaw } : {}), ...(changes.allocations !== undefined ? { allocations: changes.allocations } : {}), ...(changes.cadence !== undefined ? { cadence: changes.cadence } : {}), ...(changes.timezone !== undefined ? { timezone: changes.timezone } : {}), ...(changes.nextDueAt !== undefined ? { next_due_at: changes.nextDueAt } : {}), ...(changes.paused !== undefined ? { paused: changes.paused } : {}), updated_at: new Date().toISOString() }; const { data, error } = await client.from('lotline_contribution_schedules').update(payload).eq('id', id).eq('user_id', userId).select(columns).maybeSingle(); if (error) throw new ServiceError('unavailable', 'The contribution reminder could not be updated.'); if (!data) return result({ state: 'not-found', message: 'That contribution reminder is no longer available.' }, 404); return result({ state: 'success', schedule: data }); }
  catch (error) { return result({ state: error instanceof ServiceError ? error.kind : 'unavailable', message: error instanceof ServiceError ? error.message : 'The contribution reminder could not be updated.' }, error instanceof ServiceError && error.kind === 'invalid-input' ? 400 : 503); }
}
