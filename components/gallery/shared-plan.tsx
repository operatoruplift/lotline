'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { galleryPlanSchema, type GalleryPlan } from '@/lib/domain/gallery';
import { SiteFooter, SiteHeader } from '../site-shell';
import { PlanDetail } from './plan-detail';
import { byline } from './plan-meta';
import styles from './gallery.module.css';

type Load = { state: 'loading' } | { state: 'ready'; plan: GalleryPlan } | { state: 'missing' } | { state: 'failed' };

/** A shareable page for one community plan. */
export function SharedPlan({ id, markets = false }: { id: string; markets?: boolean }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
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
        <p className={styles.detailBy}>{byline(load.plan)}</p>
        <PlanDetail plan={load.plan} />
      </article>}
    </main>
    <SiteFooter />
  </>;
}
