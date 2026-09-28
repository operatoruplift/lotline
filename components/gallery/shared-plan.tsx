'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, Link2, LoaderCircle, ShieldCheck, Users } from 'lucide-react';
import { galleryPlanSchema, type GalleryPlan } from '@/lib/domain/gallery';
import { marketIdentity } from '@/lib/domain/markets';
import { bpsToPercent } from '@/lib/domain/rebalance';
import { SiteFooter, SiteHeader } from '../site-shell';
import { copySharedPlan } from './copy-plan';
import { byline, copiesLabel } from './plan-card';
import styles from './gallery.module.css';

type Load = { state: 'loading' } | { state: 'ready'; plan: GalleryPlan } | { state: 'missing' } | { state: 'failed' };

/** A shareable page for one community plan. */
export function SharedPlan({ id, markets = false }: { id: string; markets?: boolean }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/gallery/${encodeURIComponent(id)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then(async response => {
        const body = await response.json().catch(() => null) as { state?: string; plan?: unknown } | null;
        if (controller.signal.aborted) return;
        if (response.status === 404 || body?.state === 'not-found') { setLoad({ state: 'missing' }); return; }
        const parsed = galleryPlanSchema.safeParse(body?.plan);
        setLoad(response.ok && parsed.success && parsed.data.id === id ? { state: 'ready', plan: parsed.data } : { state: 'failed' });
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'failed' }); });
    return () => controller.abort();
  }, [id]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  return <>
    <SiteHeader active="community" markets={markets} community />
    <main id="main" className={`page-width ${styles.page}`}>
      <Link className={styles.back} href="/plans"><ArrowLeft size={14} />All community plans</Link>
      {load.state === 'loading' && <p className={styles.state} role="status"><LoaderCircle size={15} className="spinning" aria-hidden="true" />Loading this plan…</p>}
      {load.state === 'missing' && <div className={styles.empty}><h1>This plan is no longer shared.</h1><p>Its member may have stopped sharing it or deleted it.</p><Link className="button primary" href="/plans">Browse community plans</Link></div>}
      {load.state === 'failed' && <div className={styles.empty}><h1>This plan couldn’t be loaded.</h1><p>Community plans are temporarily unavailable. Your own plan is unaffected.</p></div>}
      {load.state === 'ready' && <article className={styles.detail} aria-labelledby="shared-plan-title">
        <p className="eyebrow">COMMUNITY PLAN</p>
        <h1 id="shared-plan-title">{load.plan.name}</h1>
        <p className={styles.detailMeta}>{byline(load.plan)} · <Users size={13} aria-hidden="true" /> {copiesLabel(load.plan.copy_count)}</p>
        <div className={`${styles.bar} ${styles.detailBar}`} aria-hidden="true">{load.plan.allocations.map((item, index) => <span key={item.mint} style={{ width: `${Number(item.bps) / 100}%`, background: ['var(--forest)', 'var(--sage)', 'var(--mint)', '#437365', '#82946B'][index % 5] }} />)}</div>
        <ul className={styles.detailList}>
          {load.plan.allocations.map(item => { const identity = marketIdentity(item.mint); return <li key={item.mint}>
            <span className={styles.logo} aria-hidden="true">{identity && <Image src={identity.logoUrl} alt="" width={32} height={32} unoptimized />}</span>
            <div><strong>{identity?.symbol ?? 'Asset'}</strong><span>{identity?.name ?? item.mint}</span></div>
            <b>{bpsToPercent(Number(item.bps))}%</b>
          </li>; })}
        </ul>
        <div className={styles.detailActions}>
          <button type="button" className="button primary" onClick={() => router.push(copySharedPlan(load.plan))}><Copy size={15} />Copy into my plan</button>
          <button type="button" className="button secondary" onClick={() => void copyLink()}>{copied ? <Check size={15} /> : <Link2 size={15} />}{copied ? 'Link copied' : 'Copy link'}</button>
        </div>
        <p className={styles.privacy}><ShieldCheck size={14} aria-hidden="true" />You’ll review the split with your own budget before anything changes. Nothing is bought, and this is a member’s choice, not advice.</p>
      </article>}
    </main>
    <SiteFooter />
  </>;
}
