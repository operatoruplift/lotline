'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { DISPLAY_NAME_PATTERN } from '@/lib/domain/gallery';
import styles from './share-plan-control.module.css';

export type SharedState = { id: string; displayName: string | null; copies: number };
/** A member's plan that is currently shared, as an update target. */
export type SharedTarget = { planId: string; name: string; state: SharedState };
type Props = {
  planId: string; planName: string; shared: SharedState | undefined; disabled: boolean;
  onChange: (next: SharedState | null, message: string, failed?: boolean) => void;
  /** The member's other shared plans, which this saved plan's split can replace. */
  targets?: SharedTarget[];
  onMoved?: (fromPlanId: string, next: SharedState, message: string) => void;
};

/**
 * Share a saved plan's name and split to the community, or stop sharing it.
 * The budget stays private; the display name is optional and link-free.
 */
export function SharePlanControl({ planId, planName, shared, disabled, onChange, targets = [], onMoved }: Props) {
  const [open, setOpen] = useState<false | 'share' | 'update'>(false);
  const [target, setTarget] = useState('');
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
  // Followers see the change and decide for themselves; the shared link and copy count stay.
  async function update(event: FormEvent) {
    event.preventDefault();
    const chosen = targets.find(item => item.state.id === target) ?? targets[0];
    if (!chosen || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/gallery/publish', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publishedId: chosen.state.id, planId }), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (!response.ok || body.id !== chosen.state.id) { onChange(null, body.message ?? 'The shared plan could not be updated. Please retry.', true); return; }
      setOpen(false);
      onMoved?.(chosen.planId, chosen.state, `${chosen.name} now shares ${planName}’s split. Members who follow it will see what changed and decide for themselves.`);
    } catch { onChange(null, 'The update could not be confirmed. Refresh your saved plans to check.', true); }
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
  if (!open) return <span className={styles.choices}>
    <button type="button" className={styles.open} onClick={() => setOpen('share')} disabled={disabled} aria-label={`Share ${planName} to community plans`}>Share to community</button>
    {targets.length > 0 && onMoved && <button type="button" className={styles.open} onClick={() => { setTarget(targets[0].state.id); setOpen('update'); }} disabled={disabled} aria-label={`Update a shared plan with ${planName}’s split`}>Update a shared plan</button>}
  </span>;
  if (open === 'update') return <form className={styles.form} onSubmit={update}>
    <label htmlFor={`update-target-${planId}`}>Shared plan to update</label>
    <select id={`update-target-${planId}`} value={target} onChange={event => setTarget(event.target.value)} aria-describedby={`update-note-${planId}`}>
      {targets.map(item => <option key={item.state.id} value={item.state.id}>{item.name}</option>)}
    </select>
    <p id={`update-note-${planId}`}>It will share {planName}’s name and split. Its link and copy count stay, and members who follow it see what changed before anything happens in their plan.</p>
    <div><button type="submit" disabled={busy || disabled}>Update split</button><button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
  </form>;
  return <form className={styles.form} onSubmit={share}>
    <label htmlFor={`share-name-${planId}`}>Display name <span>(optional)</span></label>
    <input id={`share-name-${planId}`} value={name} maxLength={32} autoComplete="nickname" placeholder="Shown as “by …”" aria-invalid={!valid || undefined} aria-describedby={`share-note-${planId}`} onChange={event => setName(event.target.value)} />
    <p id={`share-note-${planId}`}>{valid ? 'Only the plan name and split are shown. Your budget, email and wallet stay private.' : 'Use 2–32 letters, numbers, spaces, dots, dashes or underscores, without links.'}</p>
    <div><button type="submit" disabled={!valid || busy || disabled}>Share name and split</button><button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
  </form>;
}
