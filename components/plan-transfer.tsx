'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, ShieldCheck } from 'lucide-react';
import { formatUsdc, parseBudget, validatePlan } from '@/lib/domain/math';
import { buildPlanLink, decodePlanHash, PLAN_HASH_PREFIX, type SharedPlan } from '@/lib/domain/share';
import type { Asset, Basket, Mode } from '@/lib/domain/types';
import styles from './plan-transfer.module.css';

type Incoming = { hash: string; plan: SharedPlan | null };
type Props = { basket: Basket; mode: Mode; assets: Asset[]; disabled?: boolean; onLoad: (basket: Basket, mode: Mode) => void };

export function PlanTransfer({ basket, mode, assets, disabled = false, onLoad }: Props) {
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [copying, setCopying] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const incomingRef = useRef<Incoming | null>(null);
  const canShare = !disabled && validatePlan(basket).valid;

  useEffect(() => {
    let active = true;
    const read = () => {
      const hash = window.location.hash;
      if (!hash.startsWith(PLAN_HASH_PREFIX)) {
        // Browser Back or another in-page anchor can remove the plan fragment
        // while the review dialog is open. Close the stale prompt and return
        // focus without rewriting the user's new URL.
        if (incomingRef.current) {
          dialog.current?.close();
          const target = previousFocus.current;
          if (target?.isConnected && target !== document.body) target.focus({ preventScroll: true });
          else region.current?.focus({ preventScroll: true });
          incomingRef.current = null;
          setIncoming(null);
        }
        return;
      }
      queueMicrotask(() => { if (active) { const next = { hash, plan: decodePlanHash(hash) }; incomingRef.current = next; setIncoming(next); } });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => { active = false; window.removeEventListener('hashchange', read); };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!incoming || !element) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!element.open) element.showModal();
    keepButton.current?.focus();
    return () => { if (element.open) element.close(); };
  }, [incoming]);

  function clearIncomingHash() {
    // Leave a newer fragment, all query parameters, and router history intact.
    if (!incoming || window.location.hash !== incoming.hash) return;
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }

  function finish(applied: boolean) {
    clearIncomingHash();
    dialog.current?.close();
    incomingRef.current = null;
    setIncoming(null);
    setFailed(false);
    setMessage(applied ? 'Shared plan applied. Get fresh estimates when you’re ready.' : 'Your current draft is unchanged.');
    const target = previousFocus.current;
    if (target?.isConnected && target !== document.body) target.focus({ preventScroll: true });
    else region.current?.focus({ preventScroll: true });
  }

  function apply() {
    if (!incoming?.plan) return;
    onLoad(incoming.plan.basket, incoming.plan.mode);
    finish(true);
  }

  async function copy() {
    if (!canShare || copying) return;
    setCopying(true); setFailed(false); setMessage('');
    try {
      const link = buildPlanLink(window.location.origin, basket, mode);
      await navigator.clipboard.writeText(link);
      setMessage('Plan link copied. The recipient can review it before applying.');
    } catch {
      setFailed(true);
      setMessage('The plan link could not be copied. Check clipboard permission and try again.');
    } finally { setCopying(false); }
  }

  const shared = incoming?.plan;
  const allocations = shared ? validatePlan(shared.basket).allocations : [];
  return <div className={styles.transfer} ref={region} tabIndex={-1}>
    <button className={styles.shareButton} disabled={!canShare || copying} onClick={() => void copy()}><Link2 size={16} aria-hidden="true" />{copying ? 'Copying plan link…' : 'Copy plan link'}</button>
    <p className={styles.hint}>Share your budget and split. Your wallet, balances, and estimates stay out of the link.</p>
    <p className={`${styles.message} ${failed ? styles.error : ''}`} role="status">{message}</p>
    <dialog className={styles.dialog} ref={dialog} aria-labelledby="shared-plan-title" aria-describedby="shared-plan-description" onCancel={event => { event.preventDefault(); finish(false); }}>
      <div className={styles.dialogBody}>
        <span className={styles.eyebrow}><Link2 size={15} aria-hidden="true" /> SHARED WITH YOU</span>
        <h2 id="shared-plan-title">Review shared plan</h2>
        <p id="shared-plan-description">{shared ? 'A user-defined split. Review it before replacing your draft. Anyone with this link can see these choices.' : 'This plan link is invalid, incomplete, or uses an unsupported version. Your draft has not been changed.'}</p>
        {shared && <>
          <div className={styles.summary}><div><span>Contribution budget</span><strong>{formatUsdc(parseBudget(shared.basket.budget))} <small>USDC</small></strong></div><span className={styles.mode}>{shared.mode === 'example' ? 'Example · synthetic data' : 'Live · fresh estimates needed'}</span></div>
          <table className={styles.table}><caption className={styles.srOnly}>Shared allocation choices</caption><thead><tr><th scope="col">Asset</th><th scope="col">Split</th><th scope="col">USDC</th></tr></thead><tbody>{shared.basket.items.map((item, index) => {
            const asset = assets.find(candidate => candidate.mint === item.mint);
            return <tr key={item.mint}><th scope="row"><span>{asset?.symbol ?? `${item.mint.slice(0, 5)}…${item.mint.slice(-5)}`}</span><small>{asset?.name ?? 'Verification pending'}</small></th><td>{item.percent}%</td><td>{formatUsdc(allocations[index].usdcRaw)}</td></tr>;
          })}</tbody></table>
          <p className={styles.verification}><ShieldCheck size={16} aria-hidden="true" />{shared.mode === 'live' ? 'Live verifies each asset before estimates are available. Applying a plan does not load a wallet or request quotes.' : 'Example uses synthetic data. These choices are supplied by the person sharing the plan.'}</p>
        </>}
        <div className={styles.actions}><button className={styles.keepButton} ref={keepButton} onClick={() => finish(false)}>Keep my draft</button>{shared && <button className={styles.applyButton} onClick={apply}>Apply shared plan</button>}</div>
      </div>
    </dialog>
  </div>;
}
