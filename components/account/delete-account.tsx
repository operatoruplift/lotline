'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { ACCOUNT_DELETED_MESSAGE } from '@/lib/client/account';
import styles from './account.module.css';

type Step = 'closed' | 'confirm' | 'deleting';

/**
 * Deletes the signed-in member's account after an in-page confirmation, then
 * signs this browser out. The server deletes only the session's own account.
 */
export function DeleteAccount({ disabled = false, onDeleted, onSessionEnded }: { disabled?: boolean; onDeleted: (message: string) => void; onSessionEnded: () => void }) {
  const [step, setStep] = useState<Step>('closed');
  const [error, setError] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const titleId = useId();
  const returnFocus = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (step === 'confirm' && !error) panel.current?.focus();
    if (step === 'closed' && returnFocus.current) { returnFocus.current = false; opener.current?.focus(); }
  }, [step, error]);

  function cancel() { returnFocus.current = true; setError(''); setStep('closed'); }

  async function remove() {
    if (step !== 'confirm') return;
    setStep('deleting'); setError('');
    let response: Response;
    try { response = await fetch('/api/account', { method: 'DELETE', signal: AbortSignal.timeout(20_000) }); }
    catch {
      if (!mounted.current) return;
      setError('The deletion could not be confirmed. Check your connection, then refresh to see whether you are still signed in.'); setStep('confirm');
      return;
    }
    const data = await response.json().catch(() => null) as { state?: string; message?: string } | null;
    if (!mounted.current) return;
    if (response.status === 401) { onSessionEnded(); return; }
    if (!response.ok || data?.state !== 'deleted') {
      setError(data?.message ?? 'Your account could not be deleted right now. Nothing was removed. Please try again.'); setStep('confirm');
      return;
    }
    // The account no longer exists; clear its session from this browser too.
    try {
      const { runBrowserAuth } = await import('@/lib/supabase/client');
      await runBrowserAuth(new AbortController().signal, auth => auth.signOut({ scope: 'local' }));
    } catch { /* The server no longer accepts this session either way. */ }
    onDeleted(ACCOUNT_DELETED_MESSAGE);
  }

  if (step === 'closed') return <button ref={opener} type="button" className={styles.deleteOpen} disabled={disabled} onClick={() => { setError(''); setStep('confirm'); }}>Delete account</button>;
  const deleting = step === 'deleting';
  return <div ref={panel} className={styles.confirm} role="group" aria-labelledby={titleId} tabIndex={-1} data-delete-account="">
    <h3 id={titleId}><TriangleAlert size={16} aria-hidden="true" />Delete your account?</h3>
    <p>This permanently deletes your Lotline account and everything stored with it: saved plans, plans you share and their copy records, reports you sent, synced reminders and your purchase history. It cannot be undone.</p>
    <p>Transactions on Solana are public and permanent. Deleting your account does not remove them. Your draft and other data on this device stay until you clear this site’s data.</p>
    {error && <p className={styles.confirmError} role="alert">{error}</p>}
    <div className={styles.confirmActions}>
      <button type="button" className={styles.danger} disabled={deleting} onClick={() => void remove()}>{deleting ? <><LoaderCircle size={15} className={styles.spin} aria-hidden="true" />Deleting…</> : 'Delete my account'}</button>
      <button type="button" className={styles.keep} disabled={deleting} onClick={cancel}>Keep my account</button>
    </div>
  </div>;
}
