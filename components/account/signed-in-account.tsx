'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { accountLabel, type AccountUser } from '@/lib/client/account';
import { DeleteAccount } from './delete-account';
import styles from './account.module.css';

/** The account page for a member who is already signed in: their planner, sign out and account deletion. */
export function SignedInAccount({ user, onEnded }: { user: AccountUser; onEnded: (message: string, failed?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const { runBrowserAuth } = await import('@/lib/supabase/client');
      const result = await runBrowserAuth(new AbortController().signal, auth => auth.signOut({ scope: 'local' }));
      if (result?.error) { setBusy(false); onEnded('Sign out could not be confirmed. Please try again.', true); return; }
      onEnded('Signed out. Your draft is still saved on this device.');
    } catch { setBusy(false); onEnded('Sign out could not be completed. Please retry.', true); }
  }
  return <div className={styles.account} data-auth-reveal="1">
    <p className={styles.signedInAs}>Signed in as <strong>{accountLabel(user)}</strong></p>
    <div className={styles.accountActions}>
      <Link className={styles.planner} href="/app">Open your planner <ArrowRight size={16} aria-hidden="true" /></Link>
      <button type="button" className={styles.signOut} disabled={busy} onClick={() => void signOut()}>Sign out</button>
    </div>
    <DeleteAccount disabled={busy} onDeleted={message => onEnded(message)} onSessionEnded={() => onEnded('Your account session ended. Sign in again to manage your account.', true)} />
  </div>;
}
