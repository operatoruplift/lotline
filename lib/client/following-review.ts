import { z } from 'zod';
import { galleryPlanSchema } from '@/lib/domain/gallery';
import { MAX_PLAN_HASH_LENGTH, PLAN_HASH_PREFIX } from '@/lib/domain/share';
import { followOnDevice, readFollowing } from './following';

const REVIEW_KEY = 'lotline:following-review:v1';
const planSchema = galleryPlanSchema.pick({ id: true, name: true, display_name: true, allocations: true }).strip();
const reviewSchema = z.object({ hash: z.string().max(MAX_PLAN_HASH_LENGTH).startsWith(PLAN_HASH_PREFIX), plan: planSchema }).strict();
type Plan = z.infer<typeof planSchema>;

/** Start following a new plan, but keep an existing follow's accepted split during review. */
export function prepareFollowReview(plan: Plan, hash: string): void {
  try {
    if (!readFollowing(window.localStorage).some(item => item.id === plan.id)) followOnDevice(plan);
    // One pending review per tab, bound to the exact split and budget being opened.
    const selected = planSchema.parse(plan);
    window.sessionStorage.setItem(REVIEW_KEY, JSON.stringify({ hash, plan: selected }));
  } catch { /* A blocked store never prevents the planner review or changes an accepted split. */ }
}

/** Only applying this exact review acknowledges its author's changed split. */
export function finishFollowReview(hash: string, applied: boolean): void {
  try {
    const parsed = reviewSchema.safeParse(JSON.parse(window.sessionStorage.getItem(REVIEW_KEY) ?? 'null'));
    if (!parsed.success || parsed.data.hash !== hash) return;
    window.sessionStorage.removeItem(REVIEW_KEY);
    // Do not recreate a follow the member stopped in another tab while reviewing.
    if (applied && readFollowing(window.localStorage).some(item => item.id === parsed.data.plan.id)) followOnDevice(parsed.data.plan);
  } catch { /* The contribution can still be applied if following storage is blocked. */ }
}
