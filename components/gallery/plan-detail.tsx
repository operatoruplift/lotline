'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, Check, Copy, Link2, ShieldCheck, Users } from 'lucide-react';
import { followOnDevice, unfollowOnDevice } from '@/lib/client/following';
import type { GalleryPlan } from '@/lib/domain/gallery';
import { marketIdentity } from '@/lib/domain/markets';
import { bpsToPercent } from '@/lib/domain/rebalance';
import { copySharedPlan } from './copy-plan';
import { HideAuthor } from './hidden-authors';
import { authorName, copiesLabel, sharedOn, SplitBar, updatedOn } from './plan-meta';
import { ReportPlan } from './report-plan';
import { useFollowing } from './use-following';
import styles from './gallery.module.css';

/** A shared plan's full split and what to do with it. Its page and the leaderboard's sheet both show this. */
export function PlanDetail({ plan, onAuthorHidden }: { plan: GalleryPlan; onAuthorHidden?: (plan: GalleryPlan) => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const followed = useFollowing();
  const following = !!followed?.some(item => item.id === plan.id);
  const updated = updatedOn(plan);
  async function copyLink() {
    // Always the plan's own page, whichever view it was opened from.
    try { await navigator.clipboard.writeText(`${window.location.origin}/plans/${plan.id}`); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  return <>
    <p className={styles.detailMeta}><Users size={13} aria-hidden="true" />{copiesLabel(plan.copy_count)} · shared {sharedOn(plan)}{updated && ` · split updated ${updated}`}</p>
    <SplitBar plan={plan} className={styles.detailBar} />
    <ul className={styles.detailList} aria-label="Every weight">
      {plan.allocations.map(item => { const identity = marketIdentity(item.mint); return <li key={item.mint}>
        <span className={styles.logo} aria-hidden="true">{identity && <Image src={identity.logoUrl} alt="" width={32} height={32} unoptimized />}</span>
        <div><strong>{identity?.symbol ?? 'Asset'}</strong><span>{identity?.name ?? item.mint}</span></div>
        <b>{bpsToPercent(Number(item.bps))}%</b>
      </li>; })}
    </ul>
    <div className={styles.detailActions}>
      <button type="button" className="button primary" onClick={() => router.push(copySharedPlan(plan))}><Copy size={15} aria-hidden="true" />Copy into my plan</button>
      <button type="button" className="button secondary" aria-pressed={following} disabled={followed === null} onClick={() => { if (following) unfollowOnDevice(plan.id); else followOnDevice(plan); }}>{following ? <BellRing size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}{following ? 'Following' : 'Follow updates'}</button>
      <button type="button" className="button secondary" onClick={() => void copyLink()}>{copied ? <Check size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}{copied ? 'Link copied' : 'Copy link'}</button>
    </div>
    <p className={styles.followNote} role="status">{following ? `Portfolio will show when ${authorName(plan)} changes this split. Your plan changes only when you review and apply it.` : 'Copying also follows this plan, so Portfolio can show when its split changes.'}</p>
    <p className={styles.privacy}><ShieldCheck size={14} aria-hidden="true" />You’ll review the split with your own budget before anything changes. Nothing is bought, and this is a member’s choice, not advice.</p>
    {/* Author keys arrive with the moderation migration, so both controls appear only once reports can be stored. */}
    {plan.author_key && <div className={styles.moderation}>
      <ReportPlan plan={plan} />
      <HideAuthor plan={plan} onHidden={() => onAuthorHidden?.(plan)} />
    </div>}
  </>;
}
