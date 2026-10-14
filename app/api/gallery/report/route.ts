import { z } from 'zod';
import { REPORT_REASONS } from '@/lib/domain/gallery';
import { readSmallJson } from '@/lib/server/common';
import { galleryEnabled } from '@/lib/server/gallery';
import { noStore } from '@/lib/server/requests';
import { allowWrite, connectionHash } from '@/lib/server/write-limits';
import { adminSupabase } from '@/lib/supabase/admin';
import { isSameOriginMutation } from '@/lib/supabase/plans';
import { serverSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const body = z.object({ id: z.uuid(), reason: z.enum(REPORT_REASONS) }).strict();
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: noStore });
const unavailable = () => reply({ state: 'unavailable', message: 'The report could not be sent. Please try again.' }, 503);

/**
 * Report a shared plan. A signed-in member reports as their account; a guest as
 * a salted hash of their connection, which only this server can compute. Three
 * distinct reporters hide a plan until an operator reviews it. The answer is the
 * same for a new and a repeated report.
 */
export async function POST(request: Request) {
  if (!galleryEnabled()) return reply({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, 404);
  if (!isSameOriginMutation(request)) return reply({ state: 'forbidden', message: 'Reload Lotline before reporting a plan.' }, 403);
  try {
    const parsed = body.safeParse(await readSmallJson(request).catch(() => null));
    if (!parsed.success) return reply({ state: 'invalid-input', message: 'Choose a shared plan and a reason.' }, 400);
    if (!(await allowWrite(request, 'plan-report'))) return reply({ state: 'rate-limited', message: 'Too many reports from this connection. Try again later.' }, 429);
    const args = { p_id: parsed.data.id, p_reason: parsed.data.reason };
    const supabase = await serverSupabase();
    const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    let result: { data: unknown; error: { code?: string } | null };
    if (supabase && auth.user) result = await supabase.rpc('lotline_report_plan', args);
    else {
      const admin = adminSupabase();
      const reporter = connectionHash(request, 'plan-reporter');
      if (!admin || !reporter) return reply({ state: 'configuration-required', message: 'Sign in to report a plan on this deployment.' }, 503);
      result = await admin.rpc('lotline_report_plan_as_guest', { ...args, p_reporter: reporter });
    }
    if (result.error?.code === 'P0002') return reply({ state: 'not-found', message: 'This plan is no longer shared.' }, 404);
    if (result.error?.code === 'P0001') return reply({ state: 'rate-limited', message: 'You have sent several reports recently. Try again in an hour.' }, 429);
    if (result.error || typeof result.data !== 'boolean') return unavailable();
    return reply({ state: 'success' });
  } catch { return unavailable(); }
}
