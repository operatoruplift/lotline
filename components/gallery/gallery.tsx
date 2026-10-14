'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Info, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { showAuthorOnDevice } from '@/lib/client/hidden-authors';
import { GALLERY_SORTS, galleryPlanSchema, type GalleryPlan, type GallerySort } from '@/lib/domain/gallery';
import { visiblePlans } from '@/lib/domain/hidden-authors';
import { SiteFooter, SiteHeader } from '../site-shell';
import { HiddenAuthorsList } from './hidden-authors';
import { PlanRow } from './plan-row';
import { PlanSheet } from './plan-sheet';
import { useFollowing } from './use-following';
import { useHiddenAuthors } from './use-hidden-authors';
import styles from './gallery.module.css';

const SORT_LABELS: Record<GallerySort, string> = { copies: 'Most copied', recent: 'Newest' };
type Load = { state: 'loading' } | { state: 'ready'; plans: GalleryPlan[]; hasMore: boolean; page: number } | { state: 'failed'; message: string };
const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plans members chose to share, ranked by copies or recency and never by returns. */
export function Gallery({ markets = false }: { markets?: boolean }) {
  const [sort, setSort] = useState<GallerySort>('copies');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [opened, setOpened] = useState<GalleryPlan | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const followed = useFollowing();
  const followingIds = useMemo(() => new Set(followed?.map(item => item.id)), [followed]);
  // Authors this reader hid stay out of the list on this device; the server never learns who.
  const hiddenAuthors = useHiddenAuthors();
  const [justHidden, setJustHidden] = useState<{ key: string; name: string | null } | null>(null);
  const shown = useMemo(() => load.state === 'ready' ? visiblePlans(load.plans, hiddenAuthors ?? []) : [], [load, hiddenAuthors]);
  const undoable = justHidden && hiddenAuthors?.some(author => author.key === justHidden.key) ? justHidden : null;

  // The open plan lives in the URL (?plan=<id>), like Markets' open asset, so a view can be reopened.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('plan');
    if (id && PLAN_ID.test(id)) queueMicrotask(() => setRequested(id));
  }, []);

  useEffect(() => {
    if (!requested || load.state !== 'ready') return;
    const listed = load.plans.find(plan => plan.id === requested);
    if (listed) { queueMicrotask(() => { setOpened(listed); setRequested(null); }); return; }
    const controller = new AbortController();
    fetch(`/api/gallery/${encodeURIComponent(requested)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then(async response => {
        const parsed = galleryPlanSchema.safeParse((await response.json().catch(() => null) as { plan?: unknown } | null)?.plan);
        if (controller.signal.aborted) return;
        setRequested(null);
        if (response.ok && parsed.success && parsed.data.id === requested) setOpened(parsed.data);
        else window.history.replaceState(null, '', '/plans');
      })
      .catch(() => { if (!controller.signal.aborted) setRequested(null); });
    return () => controller.abort();
  }, [requested, load]);

  const open = useCallback((plan: GalleryPlan) => { setOpened(plan); window.history.replaceState(null, '', `/plans?plan=${plan.id}`); }, []);
  const close = useCallback(() => { setOpened(null); window.history.replaceState(null, '', '/plans'); }, []);

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
      {undoable && <p className={styles.hiddenNote} role="status">Plans from {undoable.name ?? 'this member'} are hidden on this device. <button type="button" className={styles.quietAction} onClick={() => { showAuthorOnDevice(undoable.key); setJustHidden(null); }}>Undo</button></p>}
      {load.state === 'ready' && (load.plans.length ? <>
        {shown.length ? <ol className={styles.board} aria-label={sort === 'copies' ? 'Plans by copies' : 'Newest plans'}>{shown.map((plan, index) => <PlanRow key={plan.id} plan={plan} rank={sort === 'copies' ? index + 1 : undefined} following={followingIds.has(plan.id)} onOpen={open} />)}</ol>
          : <div className={styles.empty}><h2>Every plan here is from an author you hid.</h2><p>Show an author again below, or load more plans.</p></div>}
        {load.hasMore && <button type="button" className={`button secondary ${styles.moreButton}`} onClick={() => setPage(value => value + 1)}>Show more plans</button>}
      </> : <div className={styles.empty}><h2>No shared plans yet.</h2><p>Save a plan to your account, then choose <strong>Share to community</strong> beside it. Only its name and split are shown.</p><Link className="button primary" href="/app">Open the planner</Link></div>)}
      <HiddenAuthorsList authors={hiddenAuthors} />
      <p className={styles.footnote}>Copying opens the plan for your review with your own budget. Nothing is bought, and the plan is not advice: percentages are each member’s own choice. Report a plan from its page if something is wrong with it.</p>
    </main>
    <SiteFooter />
    <PlanSheet plan={opened} onClose={close} onAuthorHidden={plan => { close(); if (plan.author_key) setJustHidden({ key: plan.author_key, name: plan.display_name }); }} />
  </>;
}
