'use client';

import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { leadingWeights, type GalleryPlan } from '@/lib/domain/gallery';
import { marketIdentity } from '@/lib/domain/markets';
import { bpsToPercent } from '@/lib/domain/rebalance';
import { copySharedPlan } from './copy-plan';
import { byline, copiesLabel, SplitBar, updatedOn } from './plan-meta';
import styles from './gallery.module.css';

/**
 * One leaderboard row: rank, name, who shared it, copies and the largest weights
 * on one line. The row opens the full split; Copy goes straight to the review.
 */
export function PlanRow({ plan, rank, following = false, onOpen }: { plan: GalleryPlan; rank?: number; following?: boolean; onOpen: (plan: GalleryPlan) => void }) {
  const router = useRouter();
  const { shown, more } = leadingWeights(plan);
  const updated = updatedOn(plan);
  const weights = [...shown.map(item => `${marketIdentity(item.mint)?.symbol ?? 'Asset'} ${bpsToPercent(item.bps)}%`), ...(more ? [`+${more}`] : [])].join(' · ');
  return <li>
    <article className={styles.row} aria-labelledby={`plan-${plan.id}`} data-ranked={rank !== undefined || undefined}>
      {rank !== undefined && <span className={styles.rank}><span className="sr-only">Rank </span>{rank}</span>}
      <div className={styles.rowHead}>
        {/* The name's button stretches over the card, so a tap anywhere opens the plan; Copy sits above it. */}
        <button type="button" id={`plan-${plan.id}`} className={styles.rowMain} onClick={() => onOpen(plan)}>{plan.name}</button>
        <span className={styles.rowMeta}>{byline(plan)} · {copiesLabel(plan.copy_count)}{updated && ` · updated ${updated}`}{following && <span className={styles.followingChip}>Following</span>}</span>
      </div>
      <button type="button" className={`button secondary ${styles.rowCopy}`} onClick={() => router.push(copySharedPlan(plan))} aria-label={`Copy ${plan.name} into your plan`}><Copy size={14} aria-hidden="true" />Copy</button>
      <span className={styles.rowWeights}>{weights}</span>
      <SplitBar plan={plan} className={styles.rowBar} />
    </article>
  </li>;
}
