import { followOnDevice } from '@/lib/client/following';
import { galleryPlanToBasket, type GalleryPlan } from '@/lib/domain/gallery';
import { encodePlanHash } from '@/lib/domain/share';
import { loadBasket } from '@/lib/domain/storage';

/**
 * The planner link that opens a shared plan in the existing review dialog,
 * keeping the reader's own budget. A signed-in member's copy is counted in the
 * background; the count never blocks or changes what opens. Copying also
 * follows the plan on this device, so Portfolio can say when its split changes.
 */
export function copySharedPlan(plan: Pick<GalleryPlan, 'id' | 'name' | 'display_name' | 'allocations'>): string {
  let budget = '1000';
  try { budget = loadBasket(window.localStorage)?.budget || budget; } catch { /* Storage can be blocked; use the default budget. */ }
  const hash = encodePlanHash(galleryPlanToBasket(plan, budget), 'live', 'xstocks');
  followOnDevice(plan);
  try {
    void fetch('/api/gallery/copy', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.id }) }).catch(() => undefined);
  } catch { /* Counting is best effort. */ }
  return `/app${hash}`;
}
