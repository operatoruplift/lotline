'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChartNoAxesCombined, FlaskConical, Link2, ListChecks, Plus, Rocket, Search, UserRound, X } from 'lucide-react';
import { planLinkTarget } from '@/lib/domain/share';
import styles from './app-tab-bar.module.css';

type Section = 'plan' | 'markets' | 'pre-ipo';
const LONG_PRESS_MS = 450;

/**
 * Phone navigation for the planning surfaces. The centre button opens the ways
 * to start or extend a plan; a long press opens the same sheet with the link
 * field focused. Nothing here buys, signs or uploads.
 */
export function AppTabBar({ active }: { active: Section }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const [open, setOpen] = useState<'menu' | 'link' | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (open === 'link') input.current?.focus();
  }, [open]);

  useEffect(() => () => { if (pressTimer.current !== null) window.clearTimeout(pressTimer.current); }, []);

  function startPress() {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => { longPressed.current = true; setOpen('link'); }, LONG_PRESS_MS);
  }
  function endPress() {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  function openLink(event: FormEvent) {
    event.preventDefault();
    const target = planLinkTarget(link, window.location.origin);
    if (!target) { setError('Paste a Lotline plan link that starts with this site and contains #plan=.'); return; }
    setOpen(null);
    window.location.assign(target);
  }

  const tab = (section: Section, href: string, label: string, Icon: typeof ListChecks) =>
    <Link href={href} className={styles.tab} aria-current={active === section ? 'page' : undefined}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>;

  return <>
    <div className={styles.spacer} aria-hidden="true" />
    <nav className={styles.bar} aria-label="Planning sections" data-app-tab-bar="">
      {tab('plan', '/app', 'Plan', ListChecks)}
      {tab('markets', '/markets', 'Markets', ChartNoAxesCombined)}
      <button type="button" className={styles.create} aria-label="Start or extend a plan (hold for plan link)" aria-haspopup="dialog"
        onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onContextMenu={event => event.preventDefault()}
        onClick={() => { if (longPressed.current) { longPressed.current = false; return; } setOpen('menu'); }}>
        <Plus size={24} aria-hidden="true" />
      </button>
      {tab('pre-ipo', '/pre-ipo', 'Pre-IPO', Rocket)}
      <Link href="/sign-in" className={styles.tab}><UserRound size={20} aria-hidden="true" /><span>Account</span></Link>
    </nav>
    <dialog ref={dialog} className={styles.sheet} aria-labelledby="create-sheet-title" onClose={() => { setOpen(null); setError(''); }} onClick={event => { if (event.target === event.currentTarget) setOpen(null); }}>
      <div className={styles.sheetBody}>
        <div className={styles.sheetTop}><h2 id="create-sheet-title">Start or extend a plan</h2><button type="button" aria-label="Close" onClick={() => setOpen(null)}><X size={18} /></button></div>
        <ul className={styles.actions}>
          <li><Link href="/markets" onClick={() => setOpen(null)}><Search size={18} aria-hidden="true" /><span><strong>Browse markets</strong><small>Find an xStock or PreStock and add it to your draft.</small></span></Link></li>
          <li><button type="button" onClick={() => setOpen('link')} aria-expanded={open === 'link'}><Link2 size={18} aria-hidden="true" /><span><strong>Open a plan link</strong><small>Review someone’s shared split before applying it.</small></span></button></li>
          <li><Link href="/app?mode=example" onClick={() => setOpen(null)}><FlaskConical size={18} aria-hidden="true" /><span><strong>Try the Example</strong><small>Synthetic balances and estimates, no wallet.</small></span></Link></li>
        </ul>
        {open === 'link' && <form className={styles.linkForm} onSubmit={openLink} noValidate>
          <label htmlFor="plan-link-input">Plan link</label>
          <input ref={input} id="plan-link-input" type="url" inputMode="url" autoComplete="off" value={link} placeholder="https://lotline.dev/app#plan=…" aria-describedby={error ? 'plan-link-error' : undefined} aria-invalid={error ? true : undefined}
            onChange={event => { setLink(event.target.value); setError(''); }} />
          {error && <p id="plan-link-error" role="alert">{error}</p>}
          <button type="submit" className="button primary">Review this plan</button>
        </form>}
        <p className={styles.note}>Adding or opening a plan never buys anything or asks a wallet to sign.</p>
      </div>
    </dialog>
  </>;
}
