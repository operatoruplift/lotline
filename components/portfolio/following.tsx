'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, Check, LoaderCircle } from 'lucide-react';
import { followOnDevice, unfollowOnDevice } from '@/lib/client/following';
import { splitChanges, type FollowedPlan, type SplitChange } from '@/lib/domain/following';
import { galleryPlanSchema, type GalleryPlan } from '@/lib/domain/gallery';
import { marketIdentity } from '@/lib/domain/markets';
import { formatBps } from '@/lib/domain/portfolio';
import { copySharedPlan } from '../gallery/copy-plan';
import { useFollowing } from '../gallery/use-following';
import styles from './portfolio.module.css';

type Latest = { state: 'loading' } | { state: 'ready'; plan: GalleryPlan } | { state: 'gone' } | { state: 'unavailable' };
const SHOWN_CHANGES = 4;
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

async function readLatest(id: string, signal: AbortSignal): Promise<Latest> {
  try {
    const response = await fetch(`/api/gallery/${encodeURIComponent(id)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
    const body = await response.json().catch(() => null) as { state?: string; plan?: unknown } | null;
    if (response.status === 404 && body?.state === 'not-found') return { state: 'gone' };
    const parsed = galleryPlanSchema.safeParse(body?.plan);
    return response.ok && parsed.success && parsed.data.id === id ? { state: 'ready', plan: parsed.data } : { state: 'unavailable' };
  } catch { return { state: 'unavailable' }; }
}

function describe(change: SplitChange): string {
  const symbol = marketIdentity(change.mint)?.symbol ?? 'An asset';
  if (!change.before) return `${symbol} added at ${formatBps(change.after)}`;
  if (!change.after) return `${symbol} removed (was ${formatBps(change.before)})`;
  return `${symbol} ${formatBps(change.before)} → ${formatBps(change.after)}`;
}

function FollowedRow({ item, latest }: { item: FollowedPlan; latest: Latest }) {
  const router = useRouter();
  const plan = latest.state === 'ready' ? latest.plan : null;
  const name = plan?.name ?? item.name;
  const who = (plan ? plan.display_name : item.displayName) ?? 'Its member';
  const changes = plan ? splitChanges(item.allocations, plan.allocations) : [];
  const stop = <button type="button" className={styles.textButton} onClick={() => unfollowOnDevice(item.id)} aria-label={`Stop following ${name}`}>Stop following</button>;
  return <li className={styles.followItem} data-changed={changes.length ? '' : undefined}>
    <div className={styles.followHead}>
      <Link href={`/plans/${item.id}`}><strong>{name}</strong></Link>
      <span>by {who}</span>
    </div>
    {latest.state === 'loading' && <p className={styles.followStatus} role="status"><LoaderCircle size={14} className="spinning" aria-hidden="true" />Checking for changes…</p>}
    {latest.state === 'unavailable' && <p className={styles.followStatus}>Couldn’t check for changes just now. Your plan is unaffected.</p>}
    {latest.state === 'gone' && <><p className={styles.followStatus}>No longer shared. Your plan is unaffected.</p><div className={styles.followActions}>{stop}</div></>}
    {plan && !changes.length && <><p className={styles.followStatus}><Check size={14} aria-hidden="true" />Up to date · following since {day.format(new Date(item.since))}</p><div className={styles.followActions}>{stop}</div></>}
    {plan && changes.length > 0 && <>
      <p className={styles.followStatus}><BellRing size={14} aria-hidden="true" /><strong>{who} changed the split{plan.split_updated_at ? ` on ${day.format(new Date(plan.split_updated_at))}` : ''}.</strong></p>
      <ul className={styles.changes} aria-label={`What changed in ${name}`}>
        {changes.slice(0, SHOWN_CHANGES).map(change => <li key={change.mint}>{describe(change)}</li>)}
        {changes.length > SHOWN_CHANGES && <li>+{changes.length - SHOWN_CHANGES} more</li>}
      </ul>
      <div className={styles.followActions}>
        <button type="button" className="button primary" onClick={() => router.push(copySharedPlan(plan))}>Review the new split</button>
        <button type="button" className={styles.textButton} onClick={() => followOnDevice(plan)}>Keep my split</button>
        {stop}
      </div>
    </>}
  </li>;
}

/** Plans this device follows, and whether their authors changed the split since the member last accepted it. */
export function Following() {
  const followed = useFollowing();
  const [latest, setLatest] = useState<Record<string, Latest>>({});
  const ids = followed?.map(item => item.id).join(',') ?? '';
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    for (const id of ids.split(',')) void readLatest(id, controller.signal).then(result => { if (!controller.signal.aborted) setLatest(current => ({ ...current, [id]: result })); });
    return () => controller.abort();
  }, [ids]);
  if (!followed?.length) return null;
  return <section className={styles.following} aria-labelledby="following-title">
    <h2 id="following-title">Following</h2>
    <p>Community plans you copied or follow. When an author changes a split, you review it with your own budget, or keep yours. Nothing changes on its own.</p>
    <ul className={styles.followList}>{followed.map(item => <FollowedRow key={item.id} item={item} latest={latest[item.id] ?? { state: 'loading' }} />)}</ul>
  </section>;
}
