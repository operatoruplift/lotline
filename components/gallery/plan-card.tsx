'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Users } from 'lucide-react';
import { leadingWeights, type GalleryPlan } from '@/lib/domain/gallery';
import { marketIdentity } from '@/lib/domain/markets';
import { bpsToPercent } from '@/lib/domain/rebalance';
import { copySharedPlan } from './copy-plan';
import styles from './gallery.module.css';

const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const byline = (plan: Pick<GalleryPlan, 'display_name'>) => plan.display_name ? `by ${plan.display_name}` : 'by a Lotline member';
export const copiesLabel = (count: number) => `${count} ${count === 1 ? 'copy' : 'copies'}`;

/** One shared plan: its name, who shared it, its largest weights and how often members copied it. */
export function PlanCard({ plan, rank }: { plan: GalleryPlan; rank?: number }) {
  const router = useRouter();
  const { shown, more } = leadingWeights(plan);
  return (
    <article className={styles.card} aria-labelledby={`plan-${plan.id}`}>
      <header className={styles.cardHeader}>
        {rank !== undefined && <span className={styles.rank} aria-label={`Rank ${rank}`}>{rank}</span>}
        <div>
          <h3 id={`plan-${plan.id}`}><Link href={`/plans/${plan.id}`}>{plan.name}</Link></h3>
          <p>{byline(plan)} · shared {date.format(new Date(plan.published_at))}</p>
        </div>
      </header>
      <div className={styles.bar} aria-hidden="true">{plan.allocations.map((item, index) => <span key={item.mint} style={{ width: `${Number(item.bps) / 100}%`, background: ['var(--forest)', 'var(--sage)', 'var(--mint)', '#437365', '#82946B'][index % 5] }} />)}</div>
      <ul className={styles.weights} aria-label="Largest weights">
        {shown.map(item => { const identity = marketIdentity(item.mint); return <li key={item.mint}>
          <span className={styles.logo} aria-hidden="true">{identity && <Image src={identity.logoUrl} alt="" width={24} height={24} unoptimized />}</span>
          <strong>{identity?.symbol ?? 'Asset'}</strong><span>{bpsToPercent(item.bps)}%</span>
        </li>; })}
        {more > 0 && <li className={styles.more}>+{more} more</li>}
      </ul>
      <footer className={styles.cardFooter}>
        <span className={styles.copies}><Users size={14} aria-hidden="true" />{copiesLabel(plan.copy_count)}</span>
        <button type="button" className="button secondary" onClick={() => router.push(copySharedPlan(plan))} aria-label={`Copy ${plan.name} into your plan`}><Copy size={14} />Copy this plan</button>
      </footer>
    </article>
  );
}
