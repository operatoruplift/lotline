'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, FlaskConical, LoaderCircle, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';
import { getWallets } from '@wallet-standard/app';
import { StandardConnect } from '@wallet-standard/features';
import { SolanaSignTransaction } from '@solana/wallet-standard-features';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { Asset, Basket, Mode, Quote } from '@/lib/domain/types';
import { validateIntentShape, type ContributionIntent, type ExecutionState } from '@/lib/domain/execution';
import { validatePlan } from '@/lib/domain/math';

type Props = { mode: Mode; basket: Basket; assets: Asset[]; quotes: Quote[] };
type ExecutionConfig = { state: string; enabled: boolean; policyVersion?: string; limits?: { slippageBps: number; maximumPriorityFeeLamports: string; maximumTotalSolCostLamports: string; maximumTokenFeeBps: number }; reasons?: string[]; message?: string };
type Review = { id: string; runId: string; legId: string; mint: string; requestId: string; messageHash: string; transaction: string; state: string; inputRaw: string; outputRaw: string; minimumOutputRaw: string; expiresAt: string; router: string; fingerprint: string; signature?: string };
type RunLeg = { id: string; key: string; mint: string };
type RunSnapshot = { run: { id: string; intent: ContributionIntent }; legs: Array<RunLeg & { state: ExecutionState; inputRaw: string }>; attempts: Array<{ id: string; legId: string; state: ExecutionState; signature?: string | null }> };

function shortAddress(value: string) { return `${value.slice(0, 4)}…${value.slice(-4)}`; }
function toBase64(bytes: Uint8Array) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function fromBase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, character => character.charCodeAt(0)); }
function intentFingerprint(intent: Pick<ContributionIntent, 'budgetRaw' | 'wallet' | 'legs'>): string { return JSON.stringify({ wallet: intent.wallet, budgetRaw: intent.budgetRaw, legs: intent.legs.map(leg => ({ mint: leg.mint, allocationBps: leg.allocationBps, maximumInputRaw: leg.maximumInputRaw })) }); }

export function ExecutionReview({ mode, basket, assets, quotes }: Props) {
  const [config, setConfig] = useState<ExecutionConfig | null>(null);
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [intent, setIntent] = useState<ContributionIntent | null>(null);
  const [runLegs, setRunLegs] = useState<RunLeg[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runFingerprint, setRunFingerprint] = useState<string | null>(null);
  const [legIndex, setLegIndex] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [confirmedMints, setConfirmedMints] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const plan = useMemo(() => validatePlan(basket), [basket]);
  const assetByMint = useMemo(() => new Map(assets.map(asset => [asset.mint, asset])), [assets]);
  const allQuotesReady = plan.valid && plan.allocations.every(item => item.usdcRaw === '0' || quotes.some(quote => quote.mint === item.mint && quote.state === 'success'));
  const currentFingerprint = useMemo(() => plan.valid ? intentFingerprint({ wallet: account?.address ?? '', budgetRaw: plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n).toString(), legs: plan.allocations.map((item, index) => ({ id: `leg-${index}`, issuerId: '', mint: item.mint, allocationBps: item.weightBps, maximumInputRaw: item.usdcRaw })) }) : null, [account?.address, plan]);

  useEffect(() => {
    if (mode === 'example') return;
    let alive = true;
    fetch('/api/execution/config', { cache: 'no-store' }).then(async response => await response.json() as ExecutionConfig).then(data => { if (alive) setConfig(data); }).catch(() => { if (alive) setConfig({ state: 'configuration-required', enabled: false, reasons: ['The execution readiness status could not be loaded.'] }); });
    try {
      const registry = getWallets();
      const sync = () => { if (alive) setWallets(registry.get()); };
      sync();
      const off = registry.on('register', sync);
      return () => { alive = false; off(); };
    } catch { /* Wallet Standard is optional; the empty state explains the next step. */ }
    return () => { alive = false; };
  }, [mode]);

  const chooseWallet = useCallback(async (wallet: Wallet) => {
    const feature = wallet.features[StandardConnect] as { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> } | undefined;
    if (!feature) { setMessage('This wallet does not support the standard connection flow.'); setError(true); return; }
    setBusy(true); setError(false);
    try {
      const result = await feature.connect();
      const next = result.accounts.find(item => item.chains.some(chain => chain === 'solana:mainnet')) ?? result.accounts[0];
      if (!next) throw new Error('The wallet did not return a Solana account.');
      setSelectedWallet(wallet); setAccount(next); setMessage(`Connected ${shortAddress(next.address)}. Lotline will request one exact transaction signature.`);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'The wallet could not connect.'); setError(true); }
    finally { setBusy(false); }
  }, []);

  const prepareOrder = useCallback(async (nextIntent: ContributionIntent, runId: string, leg: RunLeg) => {
    const orderResponse = await fetch(`/api/execution/runs/${encodeURIComponent(runId)}/legs/${encodeURIComponent(leg.id)}/order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: nextIntent, mint: leg.mint }) });
    const orderData = await orderResponse.json() as { state: string; message?: string; attempt?: { id: string; requestId: string; messageHash: string; state: string; inputRaw: string; outputRaw: string; minimumOutputRaw: string; router: string; expiresAt: string }; transaction?: string };
    if (!orderResponse.ok || orderData.state !== 'success' || !orderData.attempt || !orderData.transaction) throw new Error(orderData.message ?? 'The executable order could not be prepared.');
    setReview({ id: orderData.attempt.id, runId, legId: leg.id, mint: leg.mint, requestId: orderData.attempt.requestId, messageHash: orderData.attempt.messageHash, transaction: orderData.transaction, state: orderData.attempt.state, inputRaw: orderData.attempt.inputRaw, outputRaw: orderData.attempt.outputRaw, minimumOutputRaw: orderData.attempt.minimumOutputRaw, expiresAt: orderData.attempt.expiresAt, router: orderData.attempt.router, fingerprint: intentFingerprint(nextIntent) });
  }, []);

  const loadRun = useCallback(async (requestedRunId: string, requestNextOrder: boolean) => {
    setRestoring(true); setError(false);
    try {
      const response = await fetch(`/api/execution/runs/${encodeURIComponent(requestedRunId)}`, { cache: 'no-store' });
      const data = await response.json() as { state: string; message?: string; run?: RunSnapshot['run']; legs?: RunSnapshot['legs']; attempts?: RunSnapshot['attempts'] };
      if (!response.ok || data.state !== 'success' || !data.run || !data.legs || !data.attempts) throw new Error(data.message ?? 'The saved contribution could not be loaded.');
      const savedIntent = data.run.intent;
      if (validateIntentShape(savedIntent)) throw new Error('The saved contribution review is no longer valid. Start a new review.');
      let snapshot: RunSnapshot = { run: data.run, legs: data.legs, attempts: data.attempts };
      const activeAttempts = snapshot.attempts.filter(attempt => ['signed', 'submitted', 'confirming', 'unknown'].includes(attempt.state) && attempt.signature);
      for (const attempt of activeAttempts) {
        const reconcile = await fetch(`/api/execution/attempts/${encodeURIComponent(attempt.id)}/reconcile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: attempt.id }) });
        if (!reconcile.ok && reconcile.status !== 503) continue;
      }
      if (activeAttempts.length) {
        const refreshed = await fetch(`/api/execution/runs/${encodeURIComponent(requestedRunId)}`, { cache: 'no-store' });
        const refreshedData = await refreshed.json() as { state: string; run?: RunSnapshot['run']; legs?: RunSnapshot['legs']; attempts?: RunSnapshot['attempts'] };
        if (refreshed.ok && refreshedData.state === 'success' && refreshedData.run && refreshedData.legs && refreshedData.attempts) snapshot = { run: refreshedData.run, legs: refreshedData.legs, attempts: refreshedData.attempts };
      }
      const executable = snapshot.legs.filter(leg => BigInt(leg.inputRaw) > 0n);
      const confirmed = executable.filter(leg => leg.state === 'confirmed');
      const blocked = executable.some(leg => ['signed', 'submitted', 'confirming', 'unknown'].includes(leg.state));
      setRunId(requestedRunId); setRunFingerprint(intentFingerprint(savedIntent)); setIntent(savedIntent); setRunLegs(executable); setConfirmedCount(confirmed.length); setConfirmedMints(confirmed.map(leg => leg.mint));
      setReview(null);
      if (blocked) {
        setMessage('A previous leg still needs reconciliation. Lotline has paused new approvals until its original outcome is known.');
        return;
      }
      const next = executable.find(leg => leg.state !== 'confirmed');
      if (!next) { setMessage('All reviewed contribution legs are confirmed on Solana.'); return; }
      if (requestNextOrder) {
        await prepareOrder(savedIntent, requestedRunId, next);
        setLegIndex(executable.indexOf(next));
        setMessage(`Leg ${executable.indexOf(next) + 1} of ${executable.length}: review the exact amount before signing.`);
      } else {
        setLegIndex(executable.indexOf(next));
        setMessage(`Saved contribution restored. ${confirmed.length} of ${executable.length} legs are confirmed. Choose “Resume remaining” to request a fresh order.`);
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : 'The saved contribution could not be restored.'); setError(true); }
    finally { setRestoring(false); }
  }, [prepareOrder]);

  useEffect(() => {
    if (mode === 'example' || !config?.enabled) return;
    let stored: string | null = null;
    try { stored = sessionStorage.getItem('lotline:last-execution-run'); } catch { /* Session storage is optional. */ }
    let active = true;
    queueMicrotask(() => { if (active && stored) void loadRun(stored, false); });
    return () => { active = false; };
  }, [config?.enabled, loadRun, mode]);

  const createReview = useCallback(async () => {
    if (!config?.enabled || !config.limits || !account || !plan.valid || !allQuotesReady) return;
    setBusy(true); setError(false); setMessage(null);
    try {
      const intent = { version: 1 as const, chain: 'solana:mainnet' as const, wallet: account.address, inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', budgetRaw: plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n).toString(), legs: plan.allocations.map((item, index) => ({ id: `${assetByMint.get(item.mint)?.symbol.toLowerCase() ?? `leg-${index}`}`, issuerId: assetByMint.get(item.mint)?.symbol ?? item.mint, mint: item.mint, allocationBps: item.weightBps, maximumInputRaw: item.usdcRaw })), policyVersion: config.policyVersion ?? 'unknown', reviewedLimits: config.limits };
      const response = await fetch('/api/execution/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent }) });
      const data = await response.json() as { state: string; message?: string; run?: { id: string }; legs?: RunLeg[] };
      if (!response.ok || data.state !== 'success' || !data.run?.id || !data.legs?.length) throw new Error(data.message ?? 'The contribution review could not be created.');
      try { sessionStorage.setItem('lotline:last-execution-run', data.run.id); } catch { /* Session storage is optional. */ }
      await loadRun(data.run.id, true);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'The review could not be created.'); setError(true); }
    finally { setBusy(false); }
  }, [account, allQuotesReady, assetByMint, config, loadRun, plan]);

  const resumeRemaining = useCallback(() => {
    if (runId && runFingerprint === currentFingerprint) void loadRun(runId, true);
  }, [currentFingerprint, loadRun, runFingerprint, runId]);

  const signAndSubmit = useCallback(async () => {
    if (!review || !selectedWallet || !account) return;
    if (review.fingerprint !== currentFingerprint) {
      setReview(null);
      setMessage('The plan changed after this review. Start a new review so the signed amount matches your current plan.');
      setError(true);
      return;
    }
    const feature = selectedWallet.features[SolanaSignTransaction] as { signTransaction: (input: readonly { account: WalletAccount; transaction: Uint8Array; chain?: string }[]) => Promise<readonly { signedTransaction: Uint8Array }[]> } | undefined;
    if (!feature) { setMessage('This wallet does not support exact Solana transaction signing.'); setError(true); return; }
    setBusy(true); setError(false); setMessage('Your wallet is waiting for approval. Check the transaction details there.');
    try {
      const signed = await feature.signTransaction([{ account, transaction: fromBase64(review.transaction), chain: 'solana:mainnet' }]);
      const bytes = signed[0]?.signedTransaction;
      if (!bytes) throw new Error('The wallet returned no signed transaction.');
      const response = await fetch(`/api/execution/runs/${encodeURIComponent(review.runId)}/legs/${encodeURIComponent(review.legId)}/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: review.requestId, signedTransaction: toBase64(bytes), messageHash: review.messageHash }) });
      const data = await response.json() as { state: string; message?: string; signature?: string };
      if (!response.ok || (data.state !== 'confirming' && data.state !== 'success')) throw new Error(data.message ?? 'The transaction was not submitted.');
      setReview(current => current ? { ...current, state: 'confirming', signature: data.signature } : current);
      setMessage(data.message ?? 'Submitted. Lotline is verifying the Solana receipt.');
      if (data.signature) {
        let finalState = 'confirming';
        for (let attempt = 0; attempt < 8 && finalState === 'confirming'; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, attempt === 0 ? 400 : 1500));
          const reconcile = await fetch(`/api/execution/attempts/${encodeURIComponent(review.id)}/reconcile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: review.id }) });
          const reconciliation = await reconcile.json() as { state: string; message?: string };
          finalState = reconciliation.state;
          if (finalState === 'confirmed') {
            setConfirmedCount(count => count + 1);
            setConfirmedMints(current => current.includes(review.mint) ? current : [...current, review.mint]);
            const nextIndex = legIndex + 1;
            if (intent && runLegs[nextIndex]) {
              setLegIndex(nextIndex); setReview(null); setMessage(`Leg ${nextIndex + 1} of ${runLegs.length} is ready for review.`);
              await prepareOrder(intent, review.runId, runLegs[nextIndex]);
              setMessage(`Leg ${nextIndex + 1} of ${runLegs.length}: review the exact amount before signing.`);
            } else setMessage('All reviewed contribution legs are confirmed on Solana.');
          } else if (finalState === 'failed-onchain' || finalState === 'unknown') setMessage(reconciliation.message ?? 'The receipt needs manual reconciliation. No new order was created.');
        }
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : 'The wallet rejected the signature.'); setError(true); }
    finally { setBusy(false); }
  }, [account, currentFingerprint, intent, legIndex, prepareOrder, review, runLegs, selectedWallet]);

  if (mode === 'example') return <section className="execution-card execution-example" aria-labelledby="execution-heading"><div className="execution-card-heading"><div><div className="panel-kicker">04 <span /> EXECUTION READINESS</div><h2 id="execution-heading">Practice mode stays read-only.</h2></div><FlaskConical size={18} /></div><p>Example plans never connect a wallet, request a signature, or submit a purchase. Switch to Live for current issuer and chain checks.</p><div className="execution-note"><ShieldCheck size={15} /> No funds move in Example mode.</div></section>;

  const hasMatchingRun = Boolean(runId && runFingerprint === currentFingerprint);
  const reviewMatchesPlan = Boolean(review && review.fingerprint === currentFingerprint);
  return <section className="execution-card" aria-labelledby="execution-heading"><div className="execution-card-heading"><div><div className="panel-kicker">04 <span /> EXECUTION READINESS</div><h2 id="execution-heading">Review before you sign.</h2></div><LockKeyhole size={18} /></div>{!config?.enabled ? <div className="execution-gate"><p>Signing is deliberately switched off in this public build. Lotline still computes the exact order for every asset — you complete the contribution yourself using the prefilled Jupiter links above.</p><details className="execution-readiness"><summary>Operator readiness detail</summary><ul>{(config?.reasons ?? ['Checking server readiness…']).map(reason => <li key={reason}>{reason}</li>)}</ul></details><span><ShieldCheck size={14} /> No wallet prompt or transaction is created while signing is switched off.</span></div> :<><p>Lotline prepares one exact Jupiter order for each asset, then your wallet signs the reviewed bytes. Jupiter submits it and Solana confirmation is checked before completion.</p>{runLegs.length > 0 && <div className="execution-progress" role="status"><span>{confirmedCount} of {runLegs.length} legs confirmed{confirmedMints.length > 0 && <small className="execution-confirmed">Confirmed: {confirmedMints.map(mint => assetByMint.get(mint)?.symbol ?? mint.slice(0, 6)).join(', ')}</small>}</span><small>{review ? `Leg ${Math.min(legIndex + 1, runLegs.length)} is in review` : confirmedCount === runLegs.length ? 'Run complete' : hasMatchingRun ? 'Resume remaining when ready' : 'Ready to review'}</small></div>}{wallets.length === 0 ? <div className="execution-wallet-empty"><WalletCards size={17} /><span>No Wallet Standard wallet was detected in this browser.</span></div> : <div className="execution-wallets"><span className="field-label">Wallet</span>{account ? <div className="connected-wallet"><Check size={15} /><span>{shortAddress(account.address)}</span><small>{selectedWallet?.name ?? 'Wallet Standard'}</small></div> : <div className="wallet-options">{wallets.map(wallet => <button type="button" key={wallet.name} onClick={() => chooseWallet(wallet)} disabled={busy || restoring}>{wallet.name}<ArrowRight size={14} /></button>)}</div>}</div>}<div className="execution-actions">{!review ? <button type="button" className="button primary" onClick={hasMatchingRun ? resumeRemaining : createReview} disabled={busy || restoring || !account || !plan.valid || !allQuotesReady || (hasMatchingRun && confirmedCount === runLegs.length)}>{busy || restoring ? <><LoaderCircle size={15} className="spinning" />{restoring ? 'Restoring review…' : 'Preparing review…'}</> : hasMatchingRun ? <>Resume remaining <ArrowRight size={15} /></> : <>Review purchase <ArrowRight size={15} /></>}</button> : <>{!reviewMatchesPlan && <p className="execution-message error">The plan changed. Start a new review to refresh the exact transaction.</p>}<button type="button" className="button primary" onClick={signAndSubmit} disabled={busy || review.state === 'confirming' || !reviewMatchesPlan}>{busy ? <><LoaderCircle size={15} className="spinning" />Waiting…</> : review.state === 'confirming' ? <><Check size={15} />Submitted · verifying</> : <>Sign this purchase <ArrowRight size={15} /></>}</button></>}</div>{review && <div className="execution-review"><div><span>USDC in</span><strong>{review.inputRaw}</strong></div><div><span>Minimum output</span><strong>{review.minimumOutputRaw}</strong></div><div><span>Route</span><strong>{review.router}</strong></div><div><span>Expires</span><strong>{new Date(review.expiresAt).toLocaleTimeString()}</strong></div><p><ShieldCheck size={14} />Exact message hash verified server-side before the wallet prompt.</p></div>}{message && <p className={`execution-message${error ? ' error' : ''}`} role="status">{message}</p>}</>}</section>;
}
