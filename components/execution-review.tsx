'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Download, FlaskConical, LoaderCircle, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';
import { getWallets } from '@wallet-standard/app';
import { StandardConnect, StandardEvents, type StandardConnectFeature, type StandardEventsFeature } from '@wallet-standard/features';
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from '@solana/wallet-standard-features';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { Asset, Basket, Mode, Quote, UnitContext } from '@/lib/domain/types';
import { validateIntentShape, type ContributionIntent, type ExecutionState } from '@/lib/domain/execution';
import { formatUsdc, validatePlan } from '@/lib/domain/math';

type Props = { mode: Mode; basket: Basket; assets: Asset[]; quotes: Quote[]; catalogVerified: boolean; scheduleOccurrenceId?: string };
type ExecutionConfig = { state: string; enabled: boolean; reconciliationAvailable?: boolean; policyVersion?: string; limits?: { slippageBps: number; maximumPriorityFeeLamports: string; maximumTotalSolCostLamports: string; maximumTokenFeeBps: number }; reasons?: string[]; message?: string };
type Review = { id: string; runId: string; legId: string; mint: string; requestId: string; messageHash: string; transaction: string; state: string; inputRaw: string; outputRaw: string; minimumOutputRaw: string; expiresAt: string; router: string; fingerprint: string; signature?: string; prioritizationFeeLamports?: string; signatureFeeLamports?: string; rentFeeLamports?: string; totalSolCostLamports?: string; feeBps?: number; feeMint?: string; semanticProof?: { version: string; simulationSlot: number; issuerControlled: boolean; outputUnitContext?: UnitContext }; platformFee?: { amount?: string; feeMint: string; feeBps: number } };
type RunLeg = { id: string; leg_key: string; mint: string; state: ExecutionState; input_raw: string; receipt?: Record<string, unknown> | null };
type RunSnapshot = { run: { id: string; intent: ContributionIntent }; legs: RunLeg[]; attempts: Array<{ id: string; leg_id: string; state: ExecutionState; signature?: string | null; evidence?: Record<string, unknown> | null }> };
const unresolvedStates: readonly string[] = ['signed', 'submitted', 'confirming', 'unknown'];
const pendingKey = (runId: string) => `lotline:pending-execution:${runId}`;

function shortAddress(value: string) { return `${value.slice(0, 4)}…${value.slice(-4)}`; }
function toBase64(bytes: Uint8Array) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function fromBase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, character => character.charCodeAt(0)); }
function intentFingerprint(intent: Pick<ContributionIntent, 'budgetRaw' | 'wallet' | 'legs' | 'scheduleOccurrenceId'>): string { return JSON.stringify({ wallet: intent.wallet, budgetRaw: intent.budgetRaw, occurrence: intent.scheduleOccurrenceId, legs: intent.legs.map(leg => ({ mint: leg.mint, allocationBps: leg.allocationBps, maximumInputRaw: leg.maximumInputRaw })) }); }

function hasCompleteFees(review: Review): boolean {
  return [review.prioritizationFeeLamports, review.signatureFeeLamports, review.rentFeeLamports, review.totalSolCostLamports].every(value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) && Number.isInteger(review.feeBps) && review.feeBps! >= 0 && Boolean(review.feeMint);
}

async function readSnapshot(runId: string): Promise<RunSnapshot> {
  const response = await fetch(`/api/execution/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
  const data = await response.json() as Partial<RunSnapshot> & { state: string; message?: string };
  if (!response.ok || data.state !== 'success' || !data.run || !data.legs || !data.attempts) throw new Error(data.message ?? 'The saved contribution could not be loaded.');
  if (validateIntentShape(data.run.intent) || data.legs.some(leg => !/^(0|[1-9]\d*)$/.test(leg.input_raw))) throw new Error('The saved contribution review is invalid. No signature was requested.');
  return { run: data.run, legs: data.legs, attempts: data.attempts };
}

export function ExecutionReview({ mode, basket, assets, quotes, catalogVerified, scheduleOccurrenceId }: Props) {
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
  const [blocked, setBlocked] = useState(false);
  const [receipts, setReceipts] = useState<RunSnapshot['attempts']>([]);
  const [now, setNow] = useState(0);
  const signing = useRef(false);
  const approvalVersion = useRef(0);
  const plan = useMemo(() => validatePlan(basket), [basket]);
  const assetByMint = useMemo(() => new Map(assets.map(asset => [asset.mint, asset])), [assets]);
  const allQuotesReady = plan.valid && plan.allocations.every(item => item.usdcRaw === '0' || quotes.some(quote => quote.mint === item.mint && quote.state === 'success'));
  const currentFingerprint = useMemo(() => plan.valid ? intentFingerprint({ wallet: account?.address ?? '', budgetRaw: plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n).toString(), legs: plan.allocations.map((item, index) => ({ id: `leg-${index}`, issuerId: '', mint: item.mint, allocationBps: item.weightBps, maximumInputRaw: item.usdcRaw })), scheduleOccurrenceId }) : null, [account?.address, plan, scheduleOccurrenceId]);
  const latestFingerprint = useRef(currentFingerprint);
  useEffect(() => {
    latestFingerprint.current = mode === 'live' && catalogVerified ? currentFingerprint : null;
    approvalVersion.current += 1;
    if (!catalogVerified) queueMicrotask(() => setReview(null));
  }, [catalogVerified, currentFingerprint, mode]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  useEffect(() => {
    if (mode === 'example') return;
    let alive = true;
    fetch('/api/execution/config', { cache: 'no-store' }).then(async response => await response.json() as ExecutionConfig).then(data => { if (alive) setConfig(data); }).catch(() => { if (alive) setConfig({ state: 'configuration-required', enabled: false, reasons: ['The execution readiness status could not be loaded.'] }); });
    try {
      const registry = getWallets();
      const sync = () => { if (alive) setWallets(registry.get()); };
      sync();
      const off = registry.on('register', sync);
      const unregister = registry.on('unregister', sync);
      return () => { alive = false; off(); unregister(); };
    } catch { /* Wallet Standard is optional; the empty state explains the next step. */ }
    return () => { alive = false; };
  }, [mode]);

  const chooseWallet = useCallback(async (wallet: Wallet) => {
    const feature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect] | undefined;
    const signer = wallet.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
    if (!signer?.supportedTransactionVersions.includes(0)) { setMessage('Choose a wallet that supports signing Solana version 0 transactions.'); setError(true); return; }
    if (!feature) { setMessage('This wallet does not support the standard connection flow.'); setError(true); return; }
    setBusy(true); setError(false);
    try {
      const result = await feature.connect();
      const next = result.accounts.find(item => item.chains.includes('solana:mainnet') && item.features.includes(SolanaSignTransaction));
      if (!next) throw new Error('The wallet did not return a Solana account.');
      setSelectedWallet(wallet); setAccount(next); setMessage(`Connected ${shortAddress(next.address)}. Lotline will request one exact transaction signature.`);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'The wallet could not connect.'); setError(true); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!selectedWallet) return;
    const events = selectedWallet.features[StandardEvents] as StandardEventsFeature[typeof StandardEvents] | undefined;
    return events?.on('change', change => {
      if (!change.accounts) return;
      const next = change.accounts.find(item => item.address === account?.address && item.chains.includes('solana:mainnet') && item.features.includes(SolanaSignTransaction));
      if (!next) {
        latestFingerprint.current = null;
        setAccount(null); setReview(null);
        setMessage('The wallet account changed or disconnected. Reconnect the original wallet to resume this contribution.');
      }
    });
  }, [account?.address, selectedWallet]);

  const prepareOrder = useCallback(async (nextIntent: ContributionIntent, runId: string, leg: RunLeg) => {
    const version = approvalVersion.current;
    if (intentFingerprint(nextIntent) !== latestFingerprint.current) throw new Error('Refresh the catalog and review the saved split before requesting an order.');
    const orderResponse = await fetch(`/api/execution/runs/${encodeURIComponent(runId)}/legs/${encodeURIComponent(leg.id)}/order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: nextIntent, mint: leg.mint }) });
    const orderData = await orderResponse.json() as { state: string; message?: string; attempt?: Pick<Review, 'id' | 'requestId' | 'messageHash' | 'state' | 'inputRaw' | 'outputRaw' | 'minimumOutputRaw' | 'router' | 'expiresAt' | 'prioritizationFeeLamports' | 'signatureFeeLamports' | 'rentFeeLamports' | 'totalSolCostLamports' | 'feeBps' | 'feeMint' | 'platformFee' | 'semanticProof'>; transaction?: string };
    if (!orderResponse.ok || orderData.state !== 'success' || !orderData.attempt || !orderData.transaction) throw new Error(orderData.message ?? 'The executable order could not be prepared.');
    if (version !== approvalVersion.current || intentFingerprint(nextIntent) !== latestFingerprint.current) throw new Error('The plan, wallet, or catalog changed while preparing this order. Request a fresh review.');
    setReview({ ...orderData.attempt, runId, legId: leg.id, mint: leg.mint, transaction: orderData.transaction, fingerprint: intentFingerprint(nextIntent) });
  }, []);

  const loadRun = useCallback(async (requestedRunId: string, requestNextOrder: boolean) => {
    setRunId(requestedRunId); setRestoring(true); setError(false);
    try {
      let snapshot = await readSnapshot(requestedRunId);
      const savedIntent = snapshot.run.intent;
      let pendingAttempt: string | null = null;
      try { pendingAttempt = localStorage.getItem(pendingKey(requestedRunId)); } catch { /* The server journal remains available without device storage. */ }
      const activeAttempts = snapshot.attempts.filter(attempt => (unresolvedStates.includes(attempt.state) && attempt.signature) || (attempt.id === pendingAttempt && !['confirmed', 'failed-onchain', 'rejected', 'expired-unbroadcast'].includes(attempt.state)));
      for (const attempt of activeAttempts) {
        await fetch(`/api/execution/attempts/${encodeURIComponent(attempt.id)}/reconcile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: attempt.id }) });
      }
      if (activeAttempts.length) {
        snapshot = await readSnapshot(requestedRunId);
      }
      const executable = snapshot.legs.filter(leg => BigInt(leg.input_raw) > 0n);
      const confirmed = executable.filter(leg => leg.state === 'confirmed');
      let localPending = false;
      try {
        const pendingAttempt = localStorage.getItem(pendingKey(requestedRunId));
        const finalAttempt = snapshot.attempts.find(attempt => attempt.id === pendingAttempt && (['confirmed', 'failed-onchain', 'rejected'].includes(attempt.state) || (attempt.state === 'expired-unbroadcast' && !attempt.signature)));
        if (finalAttempt) localStorage.removeItem(pendingKey(requestedRunId));
        else localPending = Boolean(pendingAttempt);
      } catch { /* The server journal remains authoritative if browser storage is unavailable. */ }
      const blocked = localPending || executable.some(leg => unresolvedStates.includes(leg.state));
      setBlocked(blocked); setReceipts(snapshot.attempts.filter(attempt => attempt.signature));
      setRunId(requestedRunId); setRunFingerprint(intentFingerprint(savedIntent)); setIntent(savedIntent); setRunLegs(executable); setConfirmedCount(confirmed.length); setConfirmedMints(confirmed.map(leg => leg.mint));
      setReview(null);
      if (blocked) {
        setMessage('A previous leg still needs reconciliation. Lotline has paused new approvals until its original outcome is known.');
        return;
      }
      const next = executable.find(leg => leg.state !== 'confirmed');
      if (!next) { setMessage('All reviewed contribution legs are confirmed on Solana.'); return; }
      if (next.state === 'failed-onchain' || next.state === 'rejected') {
        setMessage('This contribution stopped after a failed or rejected leg. Confirmed purchases are preserved. Review a new plan containing only the remaining allocation before starting again.');
        return;
      }
      if (requestNextOrder) {
        if (intentFingerprint(savedIntent) !== latestFingerprint.current) throw new Error('Reconnect the original wallet and restore the saved split before resuming.');
        await prepareOrder(savedIntent, requestedRunId, next);
        setLegIndex(executable.indexOf(next));
        setMessage(`Leg ${executable.indexOf(next) + 1} of ${executable.length}: review the exact amount before signing.`);
      } else {
        setLegIndex(executable.indexOf(next));
        setMessage(`Saved contribution restored. ${confirmed.length} of ${executable.length} legs are confirmed. Choose “Resume remaining” to request a fresh order.`);
      }
    } catch (err) { setBlocked(true); setMessage(err instanceof Error ? err.message : 'The saved contribution could not be restored.'); setError(true); }
    finally { setRestoring(false); }
  }, [prepareOrder]);

  useEffect(() => {
    if (mode === 'example' || !(config?.enabled || config?.reconciliationAvailable)) return;
    let stored: string | null = null;
    try { stored = sessionStorage.getItem('lotline:last-execution-run'); } catch { /* Session storage is optional. */ }
    let active = true;
    queueMicrotask(() => { if (active && stored) void loadRun(stored, false); });
    return () => { active = false; };
  }, [config?.enabled, config?.reconciliationAvailable, loadRun, mode]);

  const createReview = useCallback(async () => {
    if (!config?.enabled || !config.limits || !account || !plan.valid || !allQuotesReady || !catalogVerified || blocked || signing.current) return;
    setBusy(true); setError(false); setMessage(null);
    try {
      const intent = { version: 1 as const, chain: 'solana:mainnet' as const, wallet: account.address, inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', budgetRaw: plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n).toString(), legs: plan.allocations.map((item, index) => ({ id: `${assetByMint.get(item.mint)?.symbol.toLowerCase() ?? `leg-${index}`}`, issuerId: assetByMint.get(item.mint)?.symbol ?? item.mint, mint: item.mint, allocationBps: item.weightBps, maximumInputRaw: item.usdcRaw })), policyVersion: config.policyVersion ?? 'unknown', reviewedLimits: config.limits, ...(scheduleOccurrenceId ? { scheduleOccurrenceId } : {}) };
      const response = await fetch('/api/execution/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent }) });
      const data = await response.json() as { state: string; message?: string; run?: { id: string }; legs?: RunLeg[] };
      if (!response.ok || data.state !== 'success' || !data.run?.id || !data.legs?.length) throw new Error(data.message ?? 'The contribution review could not be created.');
      try { sessionStorage.setItem('lotline:last-execution-run', data.run.id); } catch { /* Session storage is optional. */ }
      await loadRun(data.run.id, true);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'The review could not be created.'); setError(true); }
    finally { setBusy(false); }
  }, [account, allQuotesReady, assetByMint, blocked, catalogVerified, config, loadRun, plan, scheduleOccurrenceId]);

  const resumeRemaining = useCallback(() => {
    if (catalogVerified && runId && runFingerprint === currentFingerprint) void loadRun(runId, true);
  }, [catalogVerified, currentFingerprint, loadRun, runFingerprint, runId]);

  const signAndSubmit = useCallback(async () => {
    if (!review || !selectedWallet || !account || signing.current || blocked || !catalogVerified || !hasCompleteFees(review)) return;
    const version = approvalVersion.current;
    if (review.fingerprint !== latestFingerprint.current) {
      setReview(null); setMessage('The plan changed after this review. Request fresh estimates and review again.'); setError(true); return;
    }
    if (Date.parse(review.expiresAt) <= Date.now()) {
      setReview(null); setMessage('The unsigned order expired. Resume remaining to review a fresh order.'); return;
    }
    const feature = selectedWallet.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
    if (!feature?.supportedTransactionVersions.includes(0)) { setMessage('This wallet cannot sign the supported Solana version 0 transaction.'); setError(true); return; }
    if (!navigator.locks) { setMessage('This browser cannot coordinate wallet approvals across tabs. Use a current browser to continue safely.'); setError(true); return; }
    signing.current = true; setBusy(true); setError(false);
    let submissionStarted = false;
    try {
      await navigator.locks.request('lotline:wallet-approval', { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another Lotline tab is reviewing a wallet approval. Finish there, then check this contribution.');
        // Recheck the durable journal after obtaining the cross-tab lock. A stale
        // tab must never prompt for a leg another tab already submitted.
        const snapshot = await readSnapshot(review.runId);
        const leg = snapshot.legs.find(item => item.id === review.legId);
        if (!leg || leg.state === 'confirmed' || unresolvedStates.includes(leg.state) || localStorage.getItem(pendingKey(review.runId))) {
          setReview(null); await loadRun(review.runId, false); return;
        }
        if (version !== approvalVersion.current || review.fingerprint !== latestFingerprint.current || Date.parse(review.expiresAt) <= Date.now()) throw new Error('This review changed or expired. Request a fresh order before signing.');
        setMessage('Your wallet is waiting for approval. Check the transaction details there.');
        const signed = await feature.signTransaction({ account, transaction: fromBase64(review.transaction), chain: 'solana:mainnet' });
        const bytes = signed[0]?.signedTransaction;
        if (!bytes) throw new Error('The wallet returned no signed transaction.');
        if (version !== approvalVersion.current || review.fingerprint !== latestFingerprint.current) throw new Error('The plan, wallet, or catalog changed during approval. The signed bytes were not submitted.');
        // Persist the uncertainty fence before the first possible network write.
        // A lost HTTP response cannot make this transaction signable again.
        localStorage.setItem(pendingKey(review.runId), review.id);
        submissionStarted = true; setBlocked(true);
        setReview(current => current ? { ...current, state: 'confirming' } : null);
        const response = await fetch(`/api/execution/runs/${encodeURIComponent(review.runId)}/legs/${encodeURIComponent(review.legId)}/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: review.requestId, signedTransaction: toBase64(bytes), messageHash: review.messageHash }) });
        const data = await response.json() as { state: string; message?: string; signature?: string };
        if (!response.ok || (data.state !== 'confirming' && data.state !== 'success')) throw new Error(data.message ?? 'The submission outcome needs reconciliation.');
        setMessage(data.message ?? 'Submitted. Lotline is verifying the Solana receipt.');
        let confirmed = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, attempt === 0 ? 400 : 1500));
          const response = await fetch(`/api/execution/attempts/${encodeURIComponent(review.id)}/reconcile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: review.id }) });
          const reconciliation = await response.json() as { state: string; message?: string };
          if (response.ok && reconciliation.state === 'confirmed') { confirmed = true; break; }
          if (!response.ok || reconciliation.state !== 'confirming') break;
        }
        // Always reload authoritative legs and receipts; never increment a local
        // count or infer completion merely from a provider success response.
        await loadRun(review.runId, confirmed && review.fingerprint === latestFingerprint.current);
      });
    } catch (err) {
      setReview(null);
      setMessage(submissionStarted ? 'The submission outcome is uncertain. Check the original receipt before any further approval; no replacement purchase was created.' : err instanceof Error ? err.message : 'The wallet rejected the signature. No purchase was submitted.');
      setError(true);
    } finally { signing.current = false; setBusy(false); }
  }, [account, blocked, catalogVerified, loadRun, review, selectedWallet]);

  function downloadReceipts() {
    const fields = ['confirmationStatus', 'slot', 'feeLamports', 'blockTime', 'proofAt', 'inputMint', 'outputMint', 'inputDebitRaw', 'outputCreditRaw', 'walletSolDebitLamports', 'transactionMessageHash', 'reason'];
    const body = { version: 1, chain: 'solana:mainnet', runId, reviewedIntent: intent, receipts: receipts.map(receipt => ({ attemptId: receipt.id, legId: receipt.leg_id, state: receipt.state, signature: receipt.signature, evidence: Object.fromEntries(fields.flatMap(key => receipt.evidence?.[key] !== undefined ? [[key, receipt.evidence[key]]] : [])) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'lotline-purchase-receipts.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (mode === 'example') return <section className="execution-card execution-example" aria-labelledby="execution-heading"><div className="execution-card-heading"><div><div className="panel-kicker">03 <span /> EXECUTION READINESS</div><h2 id="execution-heading">Practice mode stays read-only.</h2></div><FlaskConical size={18} /></div><p>Example plans never connect a wallet, request a signature, or submit a purchase. Switch to Live for current issuer and chain checks.</p><div className="execution-note"><ShieldCheck size={15} /> No funds move in Example mode.</div></section>;

  const hasMatchingRun = Boolean(runId && runFingerprint === currentFingerprint);
  const reviewMatchesPlan = Boolean(review && review.fingerprint === currentFingerprint);
  const feesReady = Boolean(review && hasCompleteFees(review));
  const expired = Boolean(review && Date.parse(review.expiresAt) <= now);
  const terminalFailure = runLegs.some(leg => leg.state === 'failed-onchain' || leg.state === 'rejected');
  const selectedAsset = review ? assetByMint.get(review.mint) : undefined;
  return <section className="execution-card" aria-labelledby="execution-heading">
    <div className="execution-card-heading"><div><div className="panel-kicker">03 <span /> EXECUTION READINESS</div><h2 id="execution-heading">Review before you sign.</h2></div><LockKeyhole size={18} /></div>
    {!config?.enabled ? <div className="execution-gate"><p>{config?.message ?? 'Checking purchase availability…'}</p><span><ShieldCheck size={14} />Planning stays available. Opening Jupiter does not request a signature in Lotline.</span></div> : null}
    {(config?.enabled || runId) && <>
      <p>Each asset is a separate transaction. Review and approve one leg at a time; a later failure cannot undo a confirmed purchase.</p>
      {runLegs.length > 0 && <div className="execution-progress" role="status"><span>{confirmedCount} of {runLegs.length} legs confirmed{confirmedMints.length > 0 && <small className="execution-confirmed">Confirmed: {confirmedMints.map(mint => assetByMint.get(mint)?.symbol ?? mint.slice(0, 6)).join(', ')}</small>}</span><small>{blocked ? 'Reconciliation required' : confirmedCount === runLegs.length ? 'Run complete' : review ? `Leg ${Math.min(legIndex + 1, runLegs.length)} is in review` : 'Resume when ready'}</small></div>}
      {config?.enabled && (wallets.length === 0 ? <div className="execution-wallet-empty"><WalletCards size={17} /><span>No Wallet Standard wallet was detected in this browser.</span></div> : <div className="execution-wallets"><span className="field-label">Wallet</span>{account ? <div className="connected-wallet"><Check size={15} /><span>{shortAddress(account.address)}</span><small>{selectedWallet?.name ?? 'Wallet Standard'}</small></div> : <div className="wallet-options">{wallets.map(wallet => <button type="button" key={wallet.name} onClick={() => chooseWallet(wallet)} disabled={busy || restoring}>{wallet.name}<ArrowRight size={14} /></button>)}</div>}</div>)}
      {!catalogVerified && <p className="execution-message error">Current asset verification is unavailable, an issuer halt is reported, or you’re offline. Refresh the catalog before a new approval. Existing receipts can still be checked online.</p>}
      <div className="execution-actions">
        {(blocked || !config?.enabled) ? <button type="button" className="button secondary" onClick={() => { if (runId) void loadRun(runId, false); }} disabled={busy || restoring || !runId}>{busy || restoring ? 'Checking receipt…' : 'Check original receipt'}</button> : review ? <>
          {!feesReady && <p className="execution-message error">Complete fee information is unavailable. No wallet approval can be requested.</p>}
          {(!reviewMatchesPlan || expired) && <p className="execution-message error">{expired ? 'This unsigned order expired. Refresh its review before signing.' : 'The plan changed. Request fresh estimates and review the updated amount.'}</p>}
          {(!reviewMatchesPlan || expired) ? <button type="button" className="button secondary" onClick={() => setReview(null)} disabled={busy}>Update review</button> : <button type="button" className="button primary" onClick={() => void signAndSubmit()} disabled={busy || restoring || !feesReady || !catalogVerified}>{busy ? <><LoaderCircle size={15} className="spinning" />Waiting…</> : <>Sign this purchase <ArrowRight size={15} /></>}</button>}
        </> : <button type="button" className="button primary" onClick={hasMatchingRun ? resumeRemaining : createReview} disabled={busy || restoring || !account || !plan.valid || !catalogVerified || (!hasMatchingRun && !allQuotesReady) || (hasMatchingRun && (confirmedCount === runLegs.length || terminalFailure))}>{busy || restoring ? <><LoaderCircle size={15} className="spinning" />{restoring ? 'Restoring review…' : 'Preparing review…'}</> : hasMatchingRun ? <>Resume remaining <ArrowRight size={15} /></> : <>Review purchase <ArrowRight size={15} /></>}</button>}
      </div>
      {review && <div className="execution-review">
        <div><span>Asset / issuer</span><strong>{selectedAsset?.name ?? review.mint} · xStocks</strong></div>
        <div><span>Gross USDC debit</span><strong>{formatUsdc(review.inputRaw)} USDC</strong></div>
        <div><span>Estimated raw token units</span><strong>{review.outputRaw}</strong></div>
        <div><span>Minimum raw token units</span><strong>{review.minimumOutputRaw}</strong></div>
        <div><span>Verified mint</span><strong>{review.mint}</strong></div>
        <div><span>Wallet / network</span><strong>{intent?.wallet} · Solana mainnet</strong></div>
        <div><span>Priority fee</span><strong>{review.prioritizationFeeLamports ?? 'Unavailable'} lamports</strong></div>
        <div><span>Signature / network fee</span><strong>{review.signatureFeeLamports ?? 'Unavailable'} lamports</strong></div>
        <div><span>Account creation rent</span><strong>{review.rentFeeLamports ?? 'Unavailable'} lamports</strong></div>
        <div><span>Estimated total SOL debit</span><strong>{review.totalSolCostLamports ?? 'Unavailable'} lamports</strong></div>
        <div><span>Maximum total SOL cost</span><strong>{intent?.reviewedLimits.maximumTotalSolCostLamports} lamports</strong></div>
        <div><span>Token fee</span><strong>{review.feeBps === undefined || !review.feeMint ? 'Unavailable' : `${review.feeBps} basis points (${review.feeMint})`}{review.platformFee?.amount ? `; platform portion ${review.platformFee.amount} raw units` : ''}</strong></div>
        <div><span>Slippage cap</span><strong>{intent?.reviewedLimits.slippageBps} basis points</strong></div>
        <div><span>Route</span><strong>{review.router}</strong></div>
        {review.semanticProof && <><div><span>Transaction checks</span><strong>Direct Raydium CLMM · simulated at slot {review.semanticProof.simulationSlot}</strong></div>{review.semanticProof.outputUnitContext && <div><span>Display-unit observation</span><strong>Mint / Clock slot {review.semanticProof.outputUnitContext.mintSlot} · multiplier {review.semanticProof.outputUnitContext.multiplier}. Raw minimum above is enforced.</strong></div>}{review.semanticProof.issuerControlled && <p>Issuer controls apply: the issuer can freeze or administratively transfer tokens. Current technical checks do not establish eligibility or shareholder rights.</p>}</>}
        <div><span>Expires</span><strong>{new Date(review.expiresAt).toLocaleTimeString()}</strong></div>
        <p><ShieldCheck size={14} />Minimum output uses raw transferable token units. Your wallet approves this exact message; no automatic top-ups or later purchases.</p>
      </div>}
      {receipts.length > 0 && <><details className="execution-readiness" open><summary>Purchase receipts</summary><ul>{receipts.map(receipt => {
        const debit = receipt.evidence?.inputDebitRaw;
        const output = receipt.evidence?.outputCreditRaw;
        return <li key={receipt.id}>
          {assetByMint.get(runLegs.find(leg => leg.id === receipt.leg_id)?.mint ?? '')?.symbol ?? 'Asset'}: {receipt.state}{typeof receipt.evidence?.confirmationStatus === 'string' ? ` · ${receipt.evidence.confirmationStatus}` : ''}{typeof receipt.evidence?.slot === 'string' || typeof receipt.evidence?.slot === 'number' ? ` · slot ${receipt.evidence.slot}` : ''} · <a href={`https://solscan.io/tx/${encodeURIComponent(receipt.signature!)}`} target="_blank" rel="noopener noreferrer">View original transaction</a>
          {receipt.state === 'confirmed' && typeof debit === 'string' && /^\d+$/.test(debit) && typeof output === 'string' && <div>Settled debit {formatUsdc(debit)} USDC · received {output} raw token units{typeof receipt.evidence?.feeLamports === 'string' ? ` · network fee ${receipt.evidence.feeLamports} lamports` : ''}{typeof receipt.evidence?.walletSolDebitLamports === 'string' ? ` · total SOL debit ${receipt.evidence.walletSolDebitLamports} lamports` : ''}. Historical raw amounts are preserved.</div>}
        </li>;
      })}</ul></details><div className="execution-actions"><button type="button" className="button secondary" onClick={downloadReceipts}><Download size={14} />Download receipts</button></div></>}
      {message && <p className={`execution-message${error ? ' error' : ''}`} role="status">{message}</p>}
    </>}
  </section>;
}
