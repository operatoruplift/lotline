import type { GalleryPlan } from '@/lib/domain/gallery';
import styles from './gallery.module.css';

/** The planner's split colours, in the same order wherever a shared split is drawn. */
const SPLIT_COLOURS = ['var(--forest)', 'var(--sage)', 'var(--mint)', '#437365', '#82946B'];
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const byline = (plan: Pick<GalleryPlan, 'display_name'>) => plan.display_name ? `by ${plan.display_name}` : 'by a Lotline member';
export const copiesLabel = (count: number) => `${count} ${count === 1 ? 'copy' : 'copies'}`;
export const sharedOn = (plan: Pick<GalleryPlan, 'published_at'>) => date.format(new Date(plan.published_at));

/** A shared plan's weights as one bar, decorative: the same weights are always listed as text. */
export function SplitBar({ plan, className = '' }: { plan: Pick<GalleryPlan, 'allocations'>; className?: string }) {
  return <div className={`${styles.bar}${className ? ` ${className}` : ''}`} aria-hidden="true">
    {plan.allocations.map((item, index) => <span key={item.mint} style={{ width: `${Number(item.bps) / 100}%`, background: SPLIT_COLOURS[index % SPLIT_COLOURS.length] }} />)}
  </div>;
}
