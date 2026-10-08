'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, LoaderCircle, Plus } from 'lucide-react';
import type { Basket } from '@/lib/domain/types';
import { formatUsdc } from '@/lib/domain/math';
import { MAX_PLAN_ASSETS } from '@/lib/domain/limits';
import { authEmailEnabled } from '@/lib/supabase/config';
import type { CloudPlan } from '@/lib/supabase/plans';
import { accountLabel } from '@/lib/client/account';
import { DeleteAccount } from './account/delete-account';
import { SharePlanControl, type SharedState } from './gallery/share-plan-control';

type PlansModule = typeof import('@/lib/supabase/plans');
import styles from './auth.module.css';

type Session = { state: 'loading' | 'signed-in' | 'guest' | 'configuration-required' | 'unavailable'; user?: { id: string; email?: string; wallet?: string } | null };
export function CloudPlans({ basket, onLoad, galleryEnabled = false }: { basket: Basket; onLoad: (basket: Basket) => void; galleryEnabled?: boolean }) {
  const [session, setSession] = useState<Session>({ state: 'loading' });
  // Which saved plans are shared to community plans; loaded only when the gallery is on.
  const [shared, setShared] = useState<Record<string, SharedState>>({});
  const [plans, setPlans] = useState<CloudPlan[]>([]);
  const [name, setName] = useState('My contribution');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const sharingGeneration = useRef(0);
  const accountId = useRef<string | null>(null);
  const mounted = useRef(false);
  // Plan schemas (and the registry they validate against) load with the
  // account, not with the page: a guest never saves or loads a cloud plan.
  const [plansModule, setPlansModule] = useState<PlansModule | null>(null);
  const body = plansModule ? plansModule.basketToCloudPlan(basket, name) : null;

  const clearPrivateState = useCallback((nextId: string | null) => {
    accountId.current = nextId;
    setPlans([]); setShared({}); setName('My contribution'); setMessage(''); setFailed(false); setBusy(false);
  }, []);

  const expireSession = useCallback(() => {
    // A session can expire after the initial account check. Invalidate pending
    // responses and remove private state as soon as a protected request denies it.
    generation.current += 1;
    clearPrivateState(null);
    setRefreshing(false);
    setSession({ state: 'guest' });
    setFailed(true);
    setMessage('Your account session ended. Sign in again to manage cloud plans. Your local draft is unchanged.');
  }, [clearPrivateState]);

  const refreshSharing = useCallback(async (revision = generation.current, owner = accountId.current) => {
    if (!mounted.current || !owner || owner !== accountId.current) return;
    const sharingRevision = ++sharingGeneration.current;
    const mine = await fetch('/api/gallery/mine', { cache: 'no-store', signal: AbortSignal.timeout(15_000) }).then(response => response.ok ? response.json() : null).catch(() => null) as { shared?: { id: string; plan_id: string; display_name: string | null; copy_count: number }[] } | null;
    if (!mounted.current || revision !== generation.current || owner !== accountId.current || sharingRevision !== sharingGeneration.current || !Array.isArray(mine?.shared)) return;
    setShared(Object.fromEntries(mine.shared.map(entry => [entry.plan_id, { id: entry.id, displayName: entry.display_name, copies: entry.copy_count }])));
  }, []);

  const refresh = useCallback(async () => {
    const revision = ++generation.current;
    setRefreshing(true);
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (revision !== generation.current) return;
      if (response.status === 401) { expireSession(); return; }
      const next = await response.json() as Session;
      if (revision !== generation.current) return;
      if (!response.ok || !['signed-in', 'guest', 'configuration-required', 'unavailable'].includes(next.state) || (next.state === 'signed-in' && !next.user?.id)) { clearPrivateState(null); setSession({ state: 'unavailable' }); return; }
      const nextId = next.state === 'signed-in' ? next.user!.id : null;
      // Never show the previous owner's list while a new account is loading,
      // including when that account's plan request fails.
      if (accountId.current !== nextId) clearPrivateState(nextId);
      setSession(next);
      if (next.state !== 'signed-in') { setPlans([]); return; }
      const result = await fetch('/api/plans', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (revision !== generation.current) return;
      if (result.status === 401) { expireSession(); return; }
      const data = await result.json();
      if (revision !== generation.current) return;
      const { cloudPlanRecord } = await import('@/lib/supabase/plans');
      if (revision !== generation.current) return;
      const validated = cloudPlanRecord.array().safeParse(data.plans);
      if (!result.ok || !validated.success) { setFailed(true); setMessage('Your cloud plans could not be loaded. Retry when you’re online.'); return; }
      setPlans(validated.data);
      if (galleryEnabled) await refreshSharing(revision, nextId);
    } catch { if (revision === generation.current) { clearPrivateState(null); setSession({ state: 'unavailable' }); } }
    finally { if (revision === generation.current) setRefreshing(false); }
  }, [clearPrivateState, expireSession, galleryEnabled, refreshSharing]);

  const beginSharingMutation = useCallback(() => {
    const revision = generation.current;
    const owner = accountId.current;
    return () => {
      if (!mounted.current || owner === null || owner !== accountId.current) return false;
      if (revision !== generation.current) {
        // A same-account refresh may have read before this mutation committed.
        // Re-read sharing only: changing the account generation here would cancel
        // an unrelated save/delete that the member may already have started.
        void refreshSharing();
        return false;
      }
      return true;
    };
  }, [refreshSharing]);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => void refresh());
    return () => { mounted.current = false; generation.current += 1; };
  }, [refresh]);

  // The Supabase browser client exists to watch an account that is already
  // signed in. A guest has nothing to watch, and the session check above is a
  // plain fetch, so the client is loaded only once there is a session. That
  // keeps ~68 KB of gzipped JS off every guest's first load.
  useEffect(() => {
    if (session.state !== 'signed-in') return;
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    void import('@/lib/supabase/plans').then(module => { if (!cancelled) setPlansModule(module); });
    void import('@/lib/supabase/client').then(({ browserSupabase }) => {
      if (cancelled) return;
      // Account changes in another tab invalidate both private UI and late writes.
      const listener = browserSupabase()?.auth.onAuthStateChange((event, next) => {
        if (event === 'SIGNED_OUT') { generation.current += 1; clearPrivateState(null); setRefreshing(false); setSession({ state: 'guest' }); }
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && next?.user.id !== accountId.current) {
          generation.current += 1; clearPrivateState(next?.user.id ?? null); setRefreshing(false); setSession({ state: 'loading' });
          // Auth callbacks must not await another Supabase operation while its
          // session lock is held. Revalidate after the callback has returned.
          queueMicrotask(() => void refresh());
        }
      });
      subscription = listener?.data.subscription;
    });
    return () => { cancelled = true; subscription?.unsubscribe(); };
  }, [session.state, refresh, clearPrivateState]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!body || busy || refreshing) return;
    setBusy(true); setFailed(false); setMessage('');
    const revision = generation.current;
    try {
      const response = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      if (revision !== generation.current) return;
      if (response.status === 401) { expireSession(); return; }
      const data = await response.json();
      if (revision !== generation.current) return;
      const { cloudPlanRecord } = await import('@/lib/supabase/plans');
      if (revision !== generation.current) return;
      const validated = cloudPlanRecord.safeParse(data.plan);
      if (!response.ok || !validated.success) { setFailed(true); setMessage(data.message ?? 'The plan could not be saved. Please retry.'); return; }
      setPlans(current => [validated.data, ...current]);
      setMessage('Plan saved to your account. Wallet addresses and quote history were not uploaded.');
    } catch { if (revision === generation.current) { setFailed(true); setMessage('The save could not be confirmed. Refresh your saved plans before retrying.'); } }
    finally { if (revision === generation.current) setBusy(false); }
  }

  async function remove(id: string) {
    if (busy || refreshing) return;
    setBusy(true); setFailed(false); setMessage('');
    const revision = generation.current;
    try {
      const response = await fetch(`/api/plans?id=${encodeURIComponent(id)}`, { method: 'DELETE', signal: AbortSignal.timeout(15_000) });
      if (revision !== generation.current) return;
      if (response.status === 401) { expireSession(); return; }
      const data = await response.json();
      if (revision !== generation.current) return;
      if (!response.ok) { setFailed(true); setMessage(data.message ?? 'The plan could not be deleted.'); return; }
      setPlans(current => current.filter(plan => plan.id !== id)); setMessage('Cloud plan deleted. Your current local draft is unchanged.');
    } catch { if (revision === generation.current) { setFailed(true); setMessage('The deletion could not be confirmed. Refresh your saved plans to check.'); } }
    finally { if (revision === generation.current) setBusy(false); }
  }

  async function signOut() {
    if (busy || refreshing) return;
    setBusy(true); setFailed(false);
    const revision = generation.current;
    const signingOutId = accountId.current;
    try {
      const { runBrowserAuth } = await import('@/lib/supabase/client');
      const result = await runBrowserAuth(new AbortController().signal, auth => auth.signOut({ scope: 'local' }));
      if (accountId.current !== null && accountId.current !== signingOutId) return;
      if (!result || result.error) { setFailed(true); setMessage('Sign out could not be confirmed. Please try again.'); return; }
      generation.current += 1; clearPrivateState(null); setSession({ state: 'guest' }); setMessage('Signed out. Your draft is still saved on this device.');
    } catch { if (revision === generation.current) { setFailed(true); setMessage('Sign out could not be completed. Please retry.'); } }
    finally { if (revision === generation.current) setBusy(false); }
  }

  return <section className={styles.cloud} aria-labelledby="cloud-plans-title">
    <div className={styles.cloudHeading}><div><h2 id="cloud-plans-title">Keep a plan for later</h2><p>Save a named split to your account, then open it on any device.</p></div><Cloud size={21} aria-hidden="true" /></div>
    {session.state === 'loading' ? <p role="status"><LoaderCircle className={styles.spin} size={14} /> Checking account…</p>
      : session.state === 'configuration-required' ? <div className={styles.cloudLinks}><p>Accounts are not available on this deployment yet. Your draft is saved on this device.</p></div>
        : session.state === 'unavailable' ? <><p>Cloud plans are temporarily unavailable. You can keep planning locally.</p><button className={styles.textButton} disabled={busy || refreshing} onClick={() => void refresh()}>Retry account connection</button></>
          : session.state === 'guest' ? <div className={styles.cloudLinks}><Link href="/sign-in">Sign in to save plans</Link>{authEmailEnabled() ? <Link href="/sign-up">Create an account</Link> : <span className={styles.emailPending}>New account email is being set up.</span>}</div>
            : <>
              <div className={styles.cloudHeading}><p className={styles.accountEmail}>Signed in as {accountLabel(session.user)}</p><button className={styles.textButton} onClick={signOut} disabled={busy || refreshing}>Sign out</button></div>
              <form onSubmit={save} className={styles.saveForm}><label htmlFor="cloud-plan-name">Plan name<input id="cloud-plan-name" value={name} onChange={event => setName(event.target.value)} maxLength={60} required disabled={busy || refreshing} /></label><button className={styles.primary} type="submit" disabled={busy || refreshing || !body || plans.length >= 20}>{busy || refreshing ? <LoaderCircle size={16} className={styles.spin} /> : <Plus size={16} />}Save this plan</button></form>
              {!body && <p>Choose one to {MAX_PLAN_ASSETS} supported assets, a positive budget, and a split totaling 100% before saving.</p>}
              <ul className={styles.planList}>{plans.map(plan => <li key={plan.id}><div><strong>{plan.name}</strong><span>{formatUsdc(plan.budget_raw).replace(/0+$/, '').replace(/\.$/, '')} USDC · {plan.allocations.length} {plan.allocations.length === 1 ? 'asset' : 'assets'}</span>{galleryEnabled && <SharePlanControl planId={plan.id} planName={plan.name} shared={shared[plan.id]} disabled={busy || refreshing} onChange={(next, text, error) => { if (!error) { setShared(current => { const copy = { ...current }; if (next) copy[plan.id] = next; else delete copy[plan.id]; return copy; }); void refreshSharing(); } setFailed(Boolean(error)); setMessage(text); }}
                beginMutation={beginSharingMutation}
                targets={plans.flatMap(other => other.id !== plan.id && shared[other.id] ? [{ planId: other.id, name: other.name, state: shared[other.id] }] : [])}
                onMoved={(from, next, text) => { setShared(current => { const copy = { ...current }; delete copy[from]; copy[plan.id] = next; return copy; }); void refreshSharing(); setFailed(false); setMessage(text); }} />}</div><div className={styles.planActions}><button className={styles.textButton} disabled={busy || refreshing} aria-label={`Load ${plan.name}`} onClick={() => { if (busy || refreshing) return; if (!plansModule) return; onLoad(plansModule.cloudPlanToBasket({ name: plan.name, budget_raw: plan.budget_raw, allocations: plan.allocations })); setFailed(false); setMessage(`Loaded ${plan.name}. Get fresh estimates when you’re ready.`); }}>Load</button><button className={styles.textButton} disabled={busy || refreshing} aria-label={`Delete ${plan.name}`} onClick={() => void remove(plan.id)}>Delete</button></div></li>)}</ul>
              {plans.length === 0 && <p>No cloud plans yet. Your local draft is only uploaded when you choose Save this plan.</p>}
              <div className={styles.accountFooter}>
                <button className={styles.textButton} disabled={busy || refreshing} onClick={() => { setMessage(''); void refresh(); }}>Refresh saved plans</button>
                <DeleteAccount disabled={busy || refreshing} onSessionEnded={expireSession}
                  onDeleted={text => { generation.current += 1; clearPrivateState(null); setRefreshing(false); setSession({ state: 'guest' }); setMessage(text); }} />
              </div>
            </>}
    {message && <p className={failed ? styles.error : styles.success} role={failed ? 'alert' : 'status'}>{message}</p>}
  </section>;
}
