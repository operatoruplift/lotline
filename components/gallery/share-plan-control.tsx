'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { DISPLAY_NAME_PATTERN } from '@/lib/domain/gallery';
import styles from './share-plan-control.module.css';

export type SharedState = { id: string; displayName: string | null; copies: number };
type Props = { planId: string; planName: string; shared: SharedState | undefined; disabled: boolean; onChange: (next: SharedState | null, message: string, failed?: boolean) => void };

/**
 * Share a saved plan's name and split to the community, or stop sharing it.
 * The budget stays private; the display name is optional and link-free.
 */
export function SharePlanControl({ planId, planName, shared, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const valid = trimmed === '' || (trimmed.length >= 2 && trimmed.length <= 32 && DISPLAY_NAME_PATTERN.test(trimmed) && !/(https?|www|:\/\/)/i.test(trimmed));

  async function share(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/gallery/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId, displayName: trimmed }), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (!response.ok || typeof body.id !== 'string') { onChange(shared ?? null, body.message ?? 'The plan could not be shared. Please retry.', true); return; }
      setOpen(false);
      onChange({ id: body.id, displayName: trimmed || null, copies: shared?.copies ?? 0 }, `${planName} is shared. Only its name and split are public.`);
    } catch { onChange(shared ?? null, 'Sharing could not be confirmed. Refresh your saved plans before retrying.', true); }
    finally { setBusy(false); }
  }
  async function stop() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/gallery/publish?planId=${encodeURIComponent(planId)}`, { method: 'DELETE', signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok && response.status !== 404) { onChange(shared ?? null, body.message ?? 'Sharing could not be stopped. Please retry.', true); return; }
      onChange(null, `${planName} is no longer shared.`);
    } catch { onChange(shared ?? null, 'Stopping could not be confirmed. Refresh your saved plans to check.', true); }
    finally { setBusy(false); }
  }

  if (shared) return <p className={styles.shared}>
    Shared{shared.displayName ? ` as ${shared.displayName}` : ''} · {shared.copies} {shared.copies === 1 ? 'copy' : 'copies'} · <Link href={`/plans/${shared.id}`}>View</Link>
    <button type="button" onClick={() => void stop()} disabled={disabled || busy} aria-label={`Stop sharing ${planName}`}>Stop sharing</button>
  </p>;
  if (!open) return <button type="button" className={styles.open} onClick={() => setOpen(true)} disabled={disabled} aria-label={`Share ${planName} to community plans`}>Share to community</button>;
  return <form className={styles.form} onSubmit={share}>
    <label htmlFor={`share-name-${planId}`}>Display name <span>(optional)</span></label>
    <input id={`share-name-${planId}`} value={name} maxLength={32} autoComplete="nickname" placeholder="Shown as “by …”" aria-invalid={!valid || undefined} aria-describedby={`share-note-${planId}`} onChange={event => setName(event.target.value)} />
    <p id={`share-note-${planId}`}>{valid ? 'Only the plan name and split are shown. Your budget, email and wallet stay private.' : 'Use 2–32 letters, numbers, spaces, dots, dashes or underscores, without links.'}</p>
    <div><button type="submit" disabled={!valid || busy || disabled}>Share name and split</button><button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
  </form>;
}
