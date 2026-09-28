'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { GALLERY_SORTS, galleryPlanSchema, type GalleryPlan, type GallerySort } from '@/lib/domain/gallery';
import { SiteFooter, SiteHeader } from '../site-shell';
import { PlanCard } from './plan-card';
import styles from './gallery.module.css';

const SORT_LABELS: Record<GallerySort, string> = { copies: 'Most copied', recent: 'Newest' };
type Load = { state: 'loading' } | { state: 'ready'; plans: GalleryPlan[]; hasMore: boolean; page: number } | { state: 'failed'; message: string };

/** Plans members chose to share, ranked by copies or recency and never by returns. */
export function Gallery({ markets = false }: { markets?: boolean }) {
  const [sort, setSort] = useState<GallerySort>('copies');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted && page === 1) setLoad({ state: 'loading' }); });
    fetch(`/api/gallery?sort=${sort}&page=${page}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then(async response => {
        const body = await response.json().catch(() => null) as { state?: string; plans?: unknown[]; hasMore?: boolean; message?: string } | null;
        if (controller.signal.aborted) return;
        if (!response.ok || body?.state !== 'success' || !Array.isArray(body.plans)) { setLoad({ state: 'failed', message: body?.message ?? 'Community plans are temporarily unavailable.' }); return; }
        const plans = body.plans.flatMap(item => { const parsed = galleryPlanSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
        setLoad(current => ({ state: 'ready', page, hasMore: body.hasMore === true, plans: page > 1 && current.state === 'ready' ? [...current.plans, ...plans.filter(plan => !current.plans.some(existing => existing.id === plan.id))] : plans }));
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'failed', message: 'Community plans could not be loaded. Check your connection and retry.' }); });
    return () => controller.abort();
  }, [sort, page, reload]);

  return <>
    <SiteHeader active="community" markets={markets} community />
    <main id="main" className={`page-width ${styles.page}`}>
      <div className={styles.heading}>
        <p className="eyebrow">COMMUNITY PLANS</p>
        <h1>Splits other members keep coming back to.</h1>
        <p>Members can share a saved plan’s name and split. Copy one to open it in your planner, change anything, and decide for yourself. Ranked by how often members copied it, never by returns.</p>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.sorts} role="group" aria-label="Order">
          {GALLERY_SORTS.map(value => <button key={value} type="button" aria-pressed={sort === value} onClick={() => { setSort(value); setPage(1); }}>{SORT_LABELS[value]}</button>)}
        </div>
        <p className={styles.privacy}><ShieldCheck size={14} aria-hidden="true" />Shared plans show a name, a split and a copy count. Never a budget, a balance, a wallet or anyone’s activity.</p>
      </div>
      {load.state === 'loading' && <p className={styles.state} role="status"><LoaderCircle size={15} className="spinning" aria-hidden="true" />Loading community plans…</p>}
      {load.state === 'failed' && <div className={styles.state} role="status"><Info size={15} aria-hidden="true" /><span>{load.message}</span><button type="button" onClick={() => { setPage(1); setReload(value => value + 1); }}>Retry <RefreshCw size={12} /></button></div>}
      {load.state === 'ready' && (load.plans.length ? <>
        <div className={styles.grid}>{load.plans.map((plan, index) => <PlanCard key={plan.id} plan={plan} rank={sort === 'copies' ? index + 1 : undefined} />)}</div>
        {load.hasMore && <button type="button" className={`button secondary ${styles.moreButton}`} onClick={() => setPage(value => value + 1)}>Show more plans</button>}
      </> : <div className={styles.empty}><h2>No shared plans yet.</h2><p>Save a plan to your account, then choose <strong>Share to community</strong> beside it. Only its name and split are shown.</p><Link className="button primary" href="/app">Open the planner</Link></div>)}
      <p className={styles.footnote}>Copying opens the plan for your review with your own budget. Nothing is bought, and the plan is not advice: percentages are each member’s own choice.</p>
    </main>
    <SiteFooter />
  </>;
}
