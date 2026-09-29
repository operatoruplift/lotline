import { z } from 'zod';
import { DISPLAY_NAME_PATTERN } from '@/lib/domain/gallery';
import { readSmallJson } from '@/lib/server/common';
import { galleryEnabled } from '@/lib/server/gallery';
import { noStore } from '@/lib/server/requests';
import { isSameOriginMutation, planId } from '@/lib/supabase/plans';
import { serverSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const publishBody = z.object({ planId, displayName: z.string().trim().max(32).refine(value => value === '' || (value.length >= 2 && DISPLAY_NAME_PATTERN.test(value))).optional() }).strict();
const updateBody = z.object({ publishedId: z.uuid(), planId }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

async function member() {
  const supabase = await serverSupabase();
  if (!supabase) return { error: reply({ state: 'configuration-required', message: 'Accounts are not configured on this deployment.' }, 503) };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: reply({ state: 'unauthorized', message: 'Sign in to share a plan.' }, 401) };
  return { supabase };
}

/** Share one of your saved plans: its name and split only. */
export async function POST(request: Request) {
  if (!galleryEnabled()) return reply({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, 404);
  if (!isSameOriginMutation(request)) return reply({ state: 'forbidden', message: 'Reload Lotline before sharing a plan.' }, 403);
  try {
    const parsed = publishBody.safeParse(await readSmallJson(request));
    if (!parsed.success) return reply({ state: 'invalid-input', message: 'Use 2–32 letters, numbers, spaces, dots, dashes or underscores for a display name, without links.' }, 400);
    const auth = await member();
    if (auth.error) return auth.error;
    const { data, error } = await auth.supabase.rpc('lotline_publish_plan', { p_plan_id: parsed.data.planId, p_display_name: parsed.data.displayName || null });
    if (error?.code === 'P0002') return reply({ state: 'not-found', message: 'That saved plan is no longer available.' }, 404);
    if (error?.code === 'P0001') return reply({ state: 'limit-reached', message: 'You can share five plans. Stop sharing one before adding another.' }, 409);
    if (error?.code === '23514') return reply({ state: 'invalid-input', message: 'Choose a display name without links or unusual characters.' }, 400);
    if (error || typeof data !== 'string') return reply({ state: 'unavailable', message: 'The plan could not be shared. Please retry.' }, 503);
    return reply({ state: 'success', id: data }, 201);
  } catch { return reply({ state: 'unavailable', message: 'The plan could not be shared. Please retry.' }, 503); }
}

/**
 * Point one of your shared plans at another of your saved plans. Its link, copy
 * count and display name stay; members who follow it see what changed.
 */
export async function PATCH(request: Request) {
  if (!galleryEnabled()) return reply({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, 404);
  if (!isSameOriginMutation(request)) return reply({ state: 'forbidden', message: 'Reload Lotline before changing a shared plan.' }, 403);
  try {
    const parsed = updateBody.safeParse(await readSmallJson(request));
    if (!parsed.success) return reply({ state: 'invalid-input', message: 'Choose one of your shared plans and one of your saved plans.' }, 400);
    const auth = await member();
    if (auth.error) return auth.error;
    const { data, error } = await auth.supabase.rpc('lotline_update_published_plan', { p_published_id: parsed.data.publishedId, p_plan_id: parsed.data.planId });
    if (error?.code === 'P0002') return reply({ state: 'not-found', message: 'That shared plan or saved plan is no longer available.' }, 404);
    if (error?.code === 'P0001') return reply({ state: 'conflict', message: 'That saved plan is already shared on its own. Stop sharing it first.' }, 409);
    if (error || typeof data !== 'string') return reply({ state: 'unavailable', message: 'The shared plan could not be updated. Please retry.' }, 503);
    return reply({ state: 'success', id: data });
  } catch { return reply({ state: 'unavailable', message: 'The shared plan could not be updated. Please retry.' }, 503); }
}

export async function DELETE(request: Request) {
  if (!galleryEnabled()) return reply({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, 404);
  if (!isSameOriginMutation(request)) return reply({ state: 'forbidden', message: 'Reload Lotline before changing a shared plan.' }, 403);
  const id = planId.safeParse(new URL(request.url).searchParams.get('planId'));
  if (!id.success) return reply({ state: 'invalid-input', message: 'Choose a saved plan.' }, 400);
  try {
    const auth = await member();
    if (auth.error) return auth.error;
    const { data, error } = await auth.supabase.rpc('lotline_unpublish_plan', { p_plan_id: id.data });
    if (error) return reply({ state: 'unavailable', message: 'Sharing could not be stopped. Please retry.' }, 503);
    return data ? reply({ state: 'success' }) : reply({ state: 'not-found', message: 'That plan was not shared.' }, 404);
  } catch { return reply({ state: 'unavailable', message: 'Sharing could not be stopped. Please retry.' }, 503); }
}
