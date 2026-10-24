import { cronAccess } from '@/lib/server/cron-auth';
import { noStore } from '@/lib/server/requests';
import { adminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** lotline_prune_guest_execution_runs() deletes at most 100 runs per call; one daily run clears up to this many. */
const PRUNE_PASSES = 10;
/** The longest rate window is ten minutes, so a bucket row an hour old is spent whatever its purpose. */
const BUCKET_MAX_AGE_MS = 60 * 60 * 1_000;
/** The daily execution counters are kept for thirty days, as the consuming function itself does. */
const DAILY_LIMIT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1_000;

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

/**
 * Daily retention, scheduled in vercel.json. The journal's prune function ran
 * only from the guest-insert trigger, so a quiet journal never pruned, and the
 * IP buckets and daily counters were only cleaned by sampling inside the
 * request path. This runs all three on a schedule through the service-role
 * client and reports what it did. (lotline_limit_guest_execution_runs is the
 * insert trigger itself and cannot be called directly; the counters it keeps
 * are pruned here.)
 */
export async function GET(request: Request) {
  const access = cronAccess(request);
  if (access === 'unconfigured') return reply({ state: 'configuration-required', message: 'Set CRON_SECRET before scheduling retention.' }, 503);
  if (access === 'denied') return reply({ state: 'unauthorized', message: 'This route is for the scheduler.' }, 401);
  const admin = adminSupabase();
  if (!admin) return reply({ state: 'configuration-required', message: 'Retention needs the server’s Supabase secret key.' }, 503);
  const failures: string[] = [];
  let prunePasses = 0;
  for (let pass = 0; pass < PRUNE_PASSES; pass += 1) {
    const { error } = await admin.rpc('lotline_prune_guest_execution_runs');
    if (error) { failures.push('guest-runs'); break; }
    prunePasses += 1;
  }
  const buckets = await admin.from('lotline_guest_execution_ip_limits').delete({ count: 'exact' }).lt('window_started_at', new Date(Date.now() - BUCKET_MAX_AGE_MS).toISOString());
  if (buckets.error) failures.push('ip-buckets');
  const daily = await admin.from('lotline_execution_daily_limits').delete({ count: 'exact' }).lt('quota_day', new Date(Date.now() - DAILY_LIMIT_DAYS * DAY_MS).toISOString().slice(0, 10));
  if (daily.error) failures.push('daily-limits');
  return reply({ state: failures.length ? 'partial' : 'success', prunePasses, ipBucketsDeleted: buckets.count ?? 0, dailyLimitsDeleted: daily.count ?? 0, failures }, failures.length ? 503 : 200);
}
