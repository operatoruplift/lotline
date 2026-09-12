'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import { runBrowserAuth } from '@/lib/supabase/client';
import { authEmailEnabled, supabaseConfig } from '@/lib/supabase/config';
import { BrandMark } from './brand-mark';
import { LiquidGlass } from './liquid-glass';
import styles from './auth.module.css';

export type AuthMode = 'sign-in' | 'sign-up' | 'reset-password' | 'update-password';
const content = {
  'sign-in': { eyebrow: 'WELCOME BACK', title: 'Sign in to Lotline', description: 'Your next contribution, with a little continuity. Keep your saved plans together across devices.', action: 'Sign in' },
  'sign-up': { eyebrow: 'YOUR NEXT CHAPTER', title: 'Make room for a plan.', description: 'Create an account to save your splits and pick up where you left off.', action: 'Create account' },
  'reset-password': { eyebrow: 'LET’S GET YOU BACK', title: 'Reset your password.', description: 'We’ll send you a secure link to choose a new password.', action: 'Send reset link' },
  'update-password': { eyebrow: 'A FRESH START', title: 'Choose a new password.', description: 'Use at least 12 characters to protect your saved contribution plans.', action: 'Update password' },
};

export function authErrorMessage(code?: string, status?: number) {
  if (code === 'invalid_credentials') return 'The email or password didn’t match. Please try again.';
  if (code === 'email_not_confirmed') return 'Confirm your email using the link in your inbox before signing in.';
  if (code === 'weak_password') return 'Choose a stronger password with at least 12 characters.';
  if (code === 'same_password') return 'Choose a password different from your current one.';
  if (code === 'over_email_send_rate_limit' || code === 'email_address_not_authorized') return 'Email delivery is currently limited. Please try again later; your local planner is ready to use.';
  if (status === 429 || code?.includes('rate_limit')) return 'Too many requests. Please wait a few minutes before trying again.';
  return 'The account service could not complete this request. Please try again. You can continue planning as a guest.';
}

export function AuthForm({ mode, confirmationError = false }: { mode: AuthMode; confirmationError?: boolean }) {
  const router = useRouter();
  const copy = content[mode];
  const configured = Boolean(supabaseConfig());
  const emailEnabled = authEmailEnabled();
  const emailUnavailable = !emailEnabled && (mode === 'sign-up' || mode === 'reset-password');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(confirmationError ? 'That confirmation or reset link expired, was already used, or was opened in a different browser. Sign in or request a fresh reset link in this browser.' : '');
  const [failed, setFailed] = useState(confirmationError);
  const [canUpdate, setCanUpdate] = useState(mode !== 'update-password');
  const [checking, setChecking] = useState(mode === 'update-password' && configured);
  const [done, setDone] = useState(false);
  const requestScope = useRef({ mounted: true, mode, generation: 0, submitting: false, controller: null as AbortController | null });

  useEffect(() => {
    const scope = requestScope.current;
    scope.mounted = true;
    if (scope.mode !== mode) {
      scope.mode = mode;
      const generation = scope.generation;
      queueMicrotask(() => {
        if (!scope.mounted || scope.generation !== generation) return;
        setBusy(false); setDone(false); setFailed(false); setMessage('');
        setCanUpdate(mode !== 'update-password');
        setChecking(mode === 'update-password' && Boolean(supabaseConfig()));
      });
    }
    return () => { scope.mounted = false; scope.generation += 1; scope.submitting = false; scope.controller?.abort(); };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'update-password' || !configured) return;
    let cancelled = false;
    const controller = new AbortController();
    // getUser can remove an invalid SDK session. Serialize that cleanup before
    // another sign-in, while leaving background reads on their own timeout.
    runBrowserAuth(controller.signal, auth => auth.getUser()).then(({ data }) => { if (!cancelled) { setCanUpdate(Boolean(data.user)); setChecking(false); } }).catch(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [mode, configured]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scope = requestScope.current;
    if (!scope.mounted || scope.mode !== mode || scope.submitting || busy || done || !configured || emailUnavailable || (mode === 'update-password' && (!canUpdate || checking))) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if ((mode === 'sign-up' || mode === 'update-password') && password !== data.get('confirm-password')) { setFailed(true); setMessage('The passwords don’t match yet.'); return; }
    scope.controller?.abort();
    const controller = new AbortController();
    scope.controller = controller;
    const generation = ++scope.generation;
    scope.submitting = true;
    const current = () => scope.mounted && scope.mode === mode && scope.generation === generation;
    setBusy(true); setFailed(false); setMessage('');
    try {
      const origin = window.location.origin;
      const result = await runBrowserAuth(controller.signal, async auth => mode === 'sign-in' ? auth.signInWithPassword({ email, password })
        : mode === 'sign-up' ? auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback` } })
          : mode === 'reset-password' ? auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/update-password` })
            : auth.updateUser({ password }));
      if (!current()) return;
      if (result.error) { setFailed(true); setMessage(authErrorMessage(result.error.code, result.error.status)); return; }
      form.reset();
      if (mode === 'sign-in' || mode === 'update-password') { router.push('/app'); router.refresh(); return; }
      setDone(true);
      setMessage(mode === 'sign-up' ? 'If this email can create an account, a confirmation link will arrive in your inbox. Open it in this browser to finish, then sign in.' : 'If an account uses this email, a reset link will arrive in your inbox. Open it in this browser to choose a new password.');
    } catch { if (current()) { setFailed(true); setMessage('The account service could not be reached. Check your connection and try again.'); } }
    finally { if (current()) { scope.controller = null; scope.submitting = false; setBusy(false); } }
  }

  return <LiquidGlass>
    <section className={styles.formCard} aria-labelledby="auth-title">
      <header className={styles.formHeading} data-auth-reveal="0">
      <Link className={styles.brand} href="/" aria-label="Lotline home"><BrandMark /><span>Lotline</span></Link>
      <span className={styles.eyebrow}>{copy.eyebrow}</span>
      <h1 id="auth-title">{copy.title}</h1>
      <p className={styles.intro}>{emailUnavailable ? 'The full guest planner is ready. Account email delivery is still being set up.' : copy.description}</p>
      </header>
      {!configured ? <div className={styles.notice} role="status" data-auth-reveal="1"><strong>Accounts aren’t available on this deployment yet.</strong><p>You can use the full guest planner and save your draft on this device.</p><Link href="/app?mode=example">Continue with Example <ArrowRight size={16} /></Link></div>
        : emailUnavailable ? <div className={`${styles.notice} ${styles.readiness}`} role="status" data-auth-reveal="1"><ShieldCheck size={23} aria-hidden="true" /><strong>Signup and recovery emails aren’t available yet.</strong><p>You can build, save, and export a plan on this device. Existing users can still sign in.</p><Link href="/app?mode=example">Open the guest planner <ArrowRight size={16} /></Link></div>
          : checking ? <p role="status"><LoaderCircle className={styles.spin} size={18} /> Checking your reset link…</p>
          : mode === 'update-password' && !canUpdate ? <div className={styles.notice} role="status"><strong>Open a fresh password reset link.</strong><p>This page needs the session created by your email link.</p><Link href="/auth/reset-password">Request a reset link <ArrowRight size={16} /></Link></div>
            : <form method="post" onSubmit={submit} className={styles.form}>
              {mode !== 'update-password' && <label htmlFor="auth-email" data-auth-reveal="1">Email address<input required id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} disabled={busy || done} /></label>}
              {mode !== 'reset-password' && <label htmlFor="auth-password" data-auth-reveal="2">{mode === 'update-password' ? 'New password' : 'Password'}<input required id="auth-password" name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={mode === 'sign-in' ? 1 : 12} maxLength={128} aria-describedby={mode === 'sign-in' ? undefined : 'password-help'} disabled={busy || done} />{mode !== 'sign-in' && <small id="password-help">At least 12 characters. A memorable phrase works well.</small>}</label>}
              {(mode === 'sign-up' || mode === 'update-password') && <label htmlFor="auth-confirm" data-auth-reveal="3">Confirm password<input required id="auth-confirm" name="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} disabled={busy || done} /></label>}
              {mode === 'sign-in' && <Link className={styles.forgot} href="/auth/reset-password" data-auth-reveal="3">Forgot password?</Link>}
              {!done && <button className={styles.primary} type="submit" disabled={busy} data-auth-reveal="4">{busy ? <><LoaderCircle className={styles.spin} size={17} /> One moment…</> : <>{copy.action}<ArrowRight size={17} /></>}</button>}
            </form>}
      {message && <div className={failed ? styles.error : styles.success} role={failed ? 'alert' : 'status'}>{!failed && <Check size={18} />}{message}</div>}
      <div className={styles.switchLink} data-auth-reveal="5">{mode === 'sign-in' ? emailEnabled ? <>New to Lotline? <Link href="/sign-up">Create an account</Link></> : <>New to Lotline? <Link href="/app?mode=example">Try the guest planner</Link></> : <>Already have an account? <Link href="/sign-in">Sign in</Link></>}</div>
      <Link className={styles.guest} href="/app?mode=example" data-auth-reveal="6">Continue without an account <ArrowRight size={15} /></Link>
      <p className={styles.privacy} data-auth-reveal="last"><ShieldCheck size={14} aria-hidden="true" /><span>An account saves only the amounts and splits you choose to upload. It never connects to or controls your wallet.</span></p>
    </section>
  </LiquidGlass>;
}
