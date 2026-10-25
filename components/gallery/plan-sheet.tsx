'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { GalleryPlan } from '@/lib/domain/gallery';
import { PlanDetail } from './plan-detail';
import { byline } from './plan-meta';
import styles from './gallery.module.css';

/** The full split over the leaderboard: a bottom sheet on phones, a side panel on wide screens. */
export function PlanSheet({ plan, onClose, onAuthorHidden }: { plan: GalleryPlan | null; onClose: () => void; onAuthorHidden?: (plan: GalleryPlan) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Opening only: with no plan the component renders nothing, which removes the dialog.
  useEffect(() => {
    const element = dialog.current;
    if (element && plan && !element.open) element.showModal();
  }, [plan]);
  if (!plan) return null;
  return <dialog ref={dialog} className={styles.sheet} aria-labelledby="plan-sheet-title" onClose={onClose} onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.sheetBody}>
      <div className={styles.sheetGrip} aria-hidden="true" />
      <header className={styles.sheetHeader}>
        <div><p className={styles.sheetEyebrow}>{byline(plan)}</p><h2 id="plan-sheet-title">{plan.name}</h2></div>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <PlanDetail plan={plan} onAuthorHidden={onAuthorHidden} />
    </div>
  </dialog>;
}
