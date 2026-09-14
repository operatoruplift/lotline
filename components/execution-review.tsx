'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, FlaskConical, LoaderCircle, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';
import { getWallets } from '@wallet-standard/app';
import { StandardConnect } from '@wallet-standard/features';
import { SolanaSignTransaction } from '@solana/wallet-standard-features';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { Asset, Basket, Mode, Quote } from '@/lib/domain/types';
import type { ContributionIntent } from '@/lib/domain/execution';
import { validatePlan } from '@/lib/domain/math';

type Props = { mode: Mode; basket: Basket; assets: Asset[]; quotes: Quote[] };
type ExecutionConfig = { state: string; enabled: boolean; policyVersion?: string; limits?: { slippageBps: number; maximumPriorityFeeLamports: string; maximumTotalSolCostLamports: string; maximumTokenFeeBps: number }; reasons?: string[]; message?: string };
type Review = { id: string; runId: string; legId: string; requestId: string; messageHash: string; transaction: string; state: string; inputRaw: string; outputRaw: string; minimumOutputRaw: string; expiresAt: string; router: string; signature?: string };
type RunLeg = { id: string; key: string; mint: string };

function shortAddress(value: string) { return `${value.slice(0, 4)}…${value.slice(-4)}`; }
function toBase64(bytes: Uint8Array) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function fromBase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, character => character.charCodeAt(0)); }

export function ExecutionReview({ mode, basket, assets, quotes }: Props) {
  const [config, setConfig] = useState<ExecutionConfig | null>(null);
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [intent, setIntent] = useState<ContributionIntent | null>(null);
  const [runLegs, setRunLegs] = useState<RunLeg[]>([]);
  const [legIndex, setLegIndex] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const plan = useMemo(() => validatePlan(basket), [basket]);
  const assetByMint = useMemo(() => new Map(assets.map(asset => [asset.mint, asset])), [assets]);
  const allQuotesReady = plan.valid && plan.allocations.every(item => item.usdcRaw === '0' || quotes.some(quote => quote.mint === item.mint && quote.state === 'success'));

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
    setReview({ id: orderData.attempt.id, runId, legId: leg.id, requestId: orderData.attempt.requestId, messageHash: orderData.attempt.messageHash, transaction: orderData.transaction, state: orderData.attempt.state, inputRaw: orderData.attempt.inputRaw, outputRaw: orderData.attempt.outputRaw, minimumOutputRaw: orderData.attempt.minimumOutputRaw, expiresAt: orderData.attempt.expiresAt, router: orderData.attempt.router });
  }, []);

  const createReview = useCallback(async () => {
    if (!config?.enabled || !config.limits || !account || !plan.valid || !allQuotesReady) return;
    setBusy(true); setError(false); setMessage(null);
    try {
      const intent = { version: 1 as const, chain: 'solana:mainnet' as const, wallet: account.address, inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', budgetRaw: plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n).toString(), legs: plan.allocations.filter(item => BigInt(item.usdcRaw) > 0n).map((item, index) => ({ id: `${assetByMint.get(item.mint)?.symbol.toLowerCase() ?? `leg-${index}`}`, issuerId: assetByMint.get(item.mint)?.symbol ?? item.mint, mint: item.mint, allocationBps: item.weightBps, maximumInputRaw: item.usdcRaw })), policyVersion: config.policyVersion ?? 'unknown', reviewedLimits: config.limits };
      const response = await fetch('/api/execution/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent }) });
      const data = await response.json() as { state: string; message?: string; run?: { id: string }; legs?: RunLeg[] };
      if (!response.ok || data.state !== 'success' || !data.run?.id || !data.legs?.length) throw new Error(data.message ?? 'The contribution review could not be created.');
      const executableLegs = data.legs.filter(leg => intent.legs.some(item => item.mint === leg.mint && item.maximumInputRaw !== '0'));
      if (!executableLegs.length) throw new Error('This contribution has no positive execution legs.');
      setIntent(intent); setRunLegs(executableLegs); setLegIndex(0); setConfirmedCount(0); try { sessionStorage.setItem('lotline:last-execution-run', data.run.id); } catch { /* Session storage is optional. */ }
      await prepareOrder(intent, data.run.id, executableLegs[0]);
      setMessage('Review the exact amount, minimum output, route, and expiry before signing.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'The review could not be created.'); setError(true); }
    finally { setBusy(false); }
  }, [account, allQuotesReady, assetByMint, config, plan, prepareOrder]);

  const signAndSubmit = useCallback(async () => {
    if (!review || !selectedWallet || !account) return;
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
  }, [account, intent, legIndex, prepareOrder, review, runLegs, selectedWallet]);

  if (mode === 'example') return <section className="execution-card execution-example" aria-labelledby="execution-heading"><div className="execution-card-heading"><div><div className="panel-kicker">04 <span /> EXECUTION READINESS</div><h2 id="execution-heading">Practice mode stays read-only.</h2></div><FlaskConical size={18} /></div><p>Example plans never connect a wallet, request a signature, or submit a purchase. Switch to Live for current issuer and chain checks.</p><div className="execution-note"><ShieldCheck size={15} /> No funds move in Example mode.</div></section>;

  return <section className="execution-card" aria-labelledby="execution-heading"><div className="execution-card-heading"><div><div className="panel-kicker">04 <span /> EXECUTION READINESS</div><h2 id="execution-heading">Review before you sign.</h2></div><LockKeyhole size={18} /></div>{!config?.enabled ? <div className="execution-gate"><p>{config?.message ?? 'Live execution is paused until every server gate is ready.'}</p><ul>{(config?.reasons ?? ['Checking server readiness…']).map(reason => <li key={reason}>{reason}</li>)}</ul><span><ShieldCheck size={14} /> No wallet prompt or transaction is created while readiness is incomplete.</span></div> : <><p>Lotline prepares one exact Jupiter order for each asset, then your wallet signs the reviewed bytes. Jupiter submits it and Solana confirmation is checked before completion.</p>{runLegs.length > 0 && <div className="execution-progress" role="status"><span>{confirmedCount} of {runLegs.length} legs confirmed</span><small>{review ? `Leg ${Math.min(legIndex + 1, runLegs.length)} is in review` : 'Run complete'}</small></div>}{wallets.length === 0 ? <div className="execution-wallet-empty"><WalletCards size={17} /><span>No Wallet Standard wallet was detected in this browser.</span></div> : <div className="execution-wallets"><span className="field-label">Wallet</span>{account ? <div className="connected-wallet"><Check size={15} /><span>{shortAddress(account.address)}</span><small>{selectedWallet?.name ?? 'Wallet Standard'}</small></div> : <div className="wallet-options">{wallets.map(wallet => <button type="button" key={wallet.name} onClick={() => chooseWallet(wallet)} disabled={busy}>{wallet.name}<ArrowRight size={14} /></button>)}</div>}</div>}<div className="execution-actions">{!review ? <button type="button" className="button primary" onClick={createReview} disabled={busy || !account || !plan.valid || !allQuotesReady}>{busy ? <><LoaderCircle size={15} className="spinning" />Preparing review…</> : <>Review purchase <ArrowRight size={15} /></>}</button> : <button type="button" className="button primary" onClick={signAndSubmit} disabled={busy || review.state === 'confirming'}>{busy ? <><LoaderCircle size={15} className="spinning" />Waiting…</> : review.state === 'confirming' ? <><Check size={15} />Submitted · verifying</> : <>Sign this purchase <ArrowRight size={15} /></>}</button>}</div>{review && <div className="execution-review"><div><span>USDC in</span><strong>{review.inputRaw}</strong></div><div><span>Minimum output</span><strong>{review.minimumOutputRaw}</strong></div><div><span>Route</span><strong>{review.router}</strong></div><div><span>Expires</span><strong>{new Date(review.expiresAt).toLocaleTimeString()}</strong></div><p><ShieldCheck size={14} />Exact message hash verified server-side before the wallet prompt.</p></div>}{message && <p className={`execution-message${error ? ' error' : ''}`} role="status">{message}</p>}</>}</section>;
}
