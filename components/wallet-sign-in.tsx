'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { canSignIn, signInProof, walletSignInMessage } from '@/lib/client/wallet-sign-in';
import { runBrowserAuth } from '@/lib/supabase/client';
import styles from './auth.module.css';

type Attempt = { phase: 'idle' } | { phase: 'wallet' | 'verifying'; wallet: string } | { phase: 'failed'; message: string };
const copy = {
  'sign-in': { title: 'Sign in with a Solana wallet', text: 'Sign one message to prove the address. No email, and nothing is sent on-chain. New here? Your first signature creates the account.', action: 'Sign in with' },
  'sign-up': { title: 'Create an account with a Solana wallet', text: 'Sign one message to prove the address, and your account is ready. No email, and nothing is sent on-chain.', action: 'Continue with' },
};

/** Wallets registered with this page, kept current as extensions and Mobile Wallet Adapter register. Null until first read. */
function useSignInWallets(): readonly Wallet[] | null {
  const [wallets, setWallets] = useState<readonly Wallet[] | null>(null);
  useEffect(() => {
    const registry = getWallets();
    const read = () => setWallets(registry.get().filter(canSignIn));
    queueMicrotask(read);
    const offRegister = registry.on('register', read);
    const offUnregister = registry.on('unregister', read);
    return () => { offRegister(); offUnregister(); };
  }, []);
  return wallets;
}

/** Sign in with Solana through Supabase Auth: one signed message, never a transaction. */
export function WalletSignIn({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const wallets = useSignInWallets();
  const [attempt, setAttempt] = useState<Attempt>({ phase: 'idle' });
  const pending = useRef<AbortController | null>(null);
  const text = copy[mode];

  // Leaving the page abandons the attempt: a late signature or response can no longer start a session.
  useEffect(() => () => pending.current?.abort(), []);

  async function signIn(wallet: Wallet) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const fail = (message: string) => { if (pending.current === controller) pending.current = null; setAttempt({ phase: 'failed', message }); };
    setAttempt({ phase: 'wallet', wallet: wallet.name });
    try {
      // The wallet signs outside the account queue, so a prompt left open can never hold up another sign-in.
      const proof = await signInProof(wallet, { domain: window.location.host, uri: window.location.href, issuedAt: new Date().toISOString() }, controller.signal);
      if (controller.signal.aborted) return;
      setAttempt({ phase: 'verifying', wallet: wallet.name });
      const result = await runBrowserAuth(controller.signal, auth => auth.signInWithWeb3({ chain: 'solana', message: proof.message, signature: proof.signature }));
      if (controller.signal.aborted) return;
      if (result.error) { fail(walletSignInMessage(result.error, result.error)); return; }
      // Stay busy while the planner loads with the new session.
      router.push('/app');
      router.refresh();
    } catch (error) {
      if (!controller.signal.aborted) fail(walletSignInMessage(error));
    }
  }

  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setAttempt({ phase: 'idle' });
  }

  const busy = attempt.phase === 'wallet' || attempt.phase === 'verifying';
  return <section className={styles.wallet} aria-labelledby="wallet-sign-in-title" data-auth-reveal="1">
    <h2 id="wallet-sign-in-title">{text.title}</h2>
    <p>{text.text}</p>
    {wallets === null ? <p className={styles.walletStatus} role="status"><LoaderCircle className={styles.spin} size={15} aria-hidden="true" />Looking for wallets in this browser…</p>
      : wallets.length === 0 ? <p className={styles.walletEmpty}>No Solana wallet found in this browser. Install one, such as Phantom, Solflare or Backpack, then reload this page. On Android, a Solana wallet app connects through Mobile Wallet Adapter.</p>
        : <ul className={styles.wallets} aria-label="Wallets in this browser">
          {wallets.map(wallet => {
            const active = busy && attempt.wallet === wallet.name;
            return <li key={wallet.name}>
              <button type="button" className={styles.walletButton} onClick={() => void signIn(wallet)} disabled={busy} aria-busy={active || undefined}>
                {/* Wallets supply their icon as a data URI, which the image optimizer does not handle. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wallet.icon} alt="" width={28} height={28} />
                <span>{text.action} {wallet.name}</span>
                {active ? <LoaderCircle className={styles.spin} size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
              </button>
            </li>;
          })}
        </ul>}
    {busy && <p className={styles.walletStatus} role="status">
      {attempt.phase === 'wallet' ? `Check ${attempt.wallet} to sign the message.` : 'Verifying the signature…'}
      <button type="button" className={styles.textButton} onClick={cancel}>Cancel</button>
    </p>}
    {attempt.phase === 'failed' && <div className={styles.error} role="alert">{attempt.message}</div>}
  </section>;
}
