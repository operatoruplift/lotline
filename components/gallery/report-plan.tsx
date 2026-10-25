'use client';

import { useId, useState, type FormEvent } from 'react';
import { Flag, LoaderCircle } from 'lucide-react';
import { REPORT_REASON_LABELS, REPORT_REASONS, type GalleryPlan, type ReportReason } from '@/lib/domain/gallery';
import styles from './gallery.module.css';

type State = { step: 'closed' } | { step: 'choosing' | 'sending'; reason: ReportReason | null; error?: string } | { step: 'sent' };

/** Report a shared plan with a short reason. Three people's reports hide it until it is reviewed. */
export function ReportPlan({ plan }: { plan: Pick<GalleryPlan, 'id'> }) {
  const [state, setState] = useState<State>({ step: 'closed' });
  const name = useId();

  async function send(event: FormEvent) {
    event.preventDefault();
    if (state.step !== 'choosing' || !state.reason) return;
    const reason = state.reason;
    setState({ step: 'sending', reason });
    try {
      const response = await fetch('/api/gallery/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.id, reason }), signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => null) as { message?: string } | null;
      if (response.ok) { setState({ step: 'sent' }); return; }
      setState({ step: 'choosing', reason, error: data?.message ?? 'The report could not be sent. Please try again.' });
    } catch { setState({ step: 'choosing', reason, error: 'The report could not be sent. Check your connection and try again.' }); }
  }

  if (state.step === 'closed') return <button type="button" className={styles.quietAction} onClick={() => setState({ step: 'choosing', reason: null })}><Flag size={14} aria-hidden="true" />Report</button>;
  if (state.step === 'sent') return <p className={styles.reportDone} role="status">Thanks for the report. A plan that three people report is hidden until it is reviewed.</p>;
  const sending = state.step === 'sending';
  return <form className={styles.reportForm} onSubmit={send}>
    <fieldset disabled={sending}>
      <legend>Why are you reporting this plan?</legend>
      {REPORT_REASONS.map(value => <label key={value}><input type="radio" name={name} value={value} checked={state.reason === value} onChange={() => setState({ step: 'choosing', reason: value })} />{REPORT_REASON_LABELS[value]}</label>)}
    </fieldset>
    {state.error && <p className={styles.reportError} role="alert">{state.error}</p>}
    <div className={styles.reportActions}>
      <button type="submit" className="button secondary" disabled={sending || !state.reason}>{sending ? <><LoaderCircle size={14} className="spinning" aria-hidden="true" />Sending…</> : 'Send report'}</button>
      <button type="button" className={styles.quietAction} disabled={sending} onClick={() => setState({ step: 'closed' })}>Cancel</button>
    </div>
  </form>;
}
