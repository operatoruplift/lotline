'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Plus, ShieldCheck, X } from 'lucide-react';
import { addAssetToBasket, marketIdentity, type MarketIdentity } from '@/lib/domain/markets';
import type { PlannerUniverse } from '@/lib/domain/planner-universe';
import type { Basket } from '@/lib/domain/types';
import styles from './add-asset-review.module.css';

export const ADD_PARAM = 'add';
type Props = { universe: PlannerUniverse; basket: Basket; ready: boolean; onAdd: (next: Basket, symbol: string, percent: string) => void };

/** Removes only the add parameter, keeping the mode and any plan fragment. */
function clearAddParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(ADD_PARAM)) return;
  url.searchParams.delete(ADD_PARAM);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Reviews a single-asset link such as /app?add=<mint> before anything changes.
 * Only a verified asset of this planner's catalog is offered; nothing is bought.
 */
export function AddAssetReview({ universe, basket, ready, onAdd }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [asset, setAsset] = useState<Readonly<MarketIdentity> | null>(null);
  const [unknown, setUnknown] = useState(false);

  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => {
      const value = new URLSearchParams(window.location.search).get(ADD_PARAM);
      if (value === null) return;
      const identity = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) ? marketIdentity(value) : undefined;
      if (identity && identity.universe === universe) setAsset(identity);
      else setUnknown(true);
    });
  }, [ready, universe]);

  useEffect(() => {
    const element = dialog.current;
    if (element && (asset || unknown) && !element.open) element.showModal();
  }, [asset, unknown]);

  const close = () => { clearAddParam(); dialog.current?.close(); setAsset(null); setUnknown(false); };
  const preview = asset ? addAssetToBasket(basket, asset.mint, universe) : null;

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="add-asset-title" onClose={() => { clearAddParam(); setAsset(null); setUnknown(false); }}>
    <div className={styles.top}><h2 id="add-asset-title">{asset ? `Add ${asset.symbol} to your plan?` : 'This asset link can’t be used here'}</h2><button type="button" aria-label="Close" onClick={close}><X size={18} /></button></div>
    {asset && <div className={styles.asset}>
      <span className={styles.logo} aria-hidden="true"><Image src={asset.logoUrl} alt="" width={40} height={40} unoptimized /></span>
      <div><strong>{asset.name}</strong><span>{asset.symbol} · {asset.issuer}{asset.underlyingSymbol ? ` · tracks ${asset.underlyingSymbol}` : ''}</span></div>
    </div>}
    <p className={styles.body}>
      {!asset ? 'The link names an asset outside this planner’s verified catalog, so nothing was added.'
        : !preview?.ok ? (preview?.reason === 'duplicate' ? `${asset.symbol} is already in your plan. Nothing changes.` : 'Your plan already has 10 assets. Remove one before adding another.')
          : `It joins your draft at ${preview.percent}%, the share still unassigned, and your other percentages stay as they are. Set its share before requesting estimates.`}
    </p>
    <p className={styles.safety}><ShieldCheck size={14} aria-hidden="true" />Nothing is bought, and no wallet is asked to sign.</p>
    <div className={styles.actions}>
      {asset && preview?.ok && <button type="button" className="button primary" onClick={() => { onAdd(preview.basket, asset.symbol, preview.percent); close(); }}><Plus size={15} />Add to plan</button>}
      <button type="button" className="button secondary" onClick={close}>{asset && preview?.ok ? 'Not now' : 'Close'}</button>
    </div>
  </dialog>;
}
