'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Info, LoaderCircle } from 'lucide-react';
import type { Asset, Mode } from '@/lib/domain/types';
import { contextAt } from '@/lib/domain/enrichment-freshness';
import { ENRICHMENT_MAX_AGE_MS, assetDetailsResponseSchema, type AssetDetailsResponse } from '@/lib/domain/enrichment';
import styles from './asset-details.module.css';

function ContextResult({ asset, mode }: { asset: Asset; mode: Mode }) {
  const request = useRef<AbortController | null>(null);
  const [snapshot, setResult] = useState<AssetDetailsResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const result = snapshot ? contextAt(snapshot, now) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const expiry = Date.parse(snapshot?.details?.snapshotFetchedAt ?? '') + ENRICHMENT_MAX_AGE_MS;
    const update = () => setNow(Date.now());
    const timer = Number.isFinite(expiry) && expiry > Date.now() ? window.setTimeout(update, expiry - Date.now() + 1) : undefined;
    document.addEventListener('visibilitychange', update); window.addEventListener('focus', update);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); };
  }, [snapshot]);
  async function load() {
    if (mode !== 'live' || busy) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`/api/asset-details?${new URLSearchParams({ network:'solana', mint:asset.mint })}`, { cache:'no-store', signal:AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      const parsed = assetDetailsResponseSchema.safeParse(await response.json());
      if (controller.signal.aborted) return;
      if (!parsed.success || parsed.data.network !== 'solana' || parsed.data.mint !== asset.mint || parsed.data.source !== 'tokens.xyz') throw new Error('Asset context could not be verified. Your plan is still ready to use.');
      setNow(Date.now()); setResult(parsed.data);
    } catch {
      if (!controller.signal.aborted) setError('Asset context is temporarily unavailable. Your calculations and estimates are unchanged.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  if (mode === 'example') return <p className={styles.note}>Example uses synthetic balances and estimates. Optional live asset context is available in Live mode.</p>;
  const details = result?.details;
  return <><p className={styles.mint}>Solana · <span>{asset.mint}</span></p><button type="button" className="button secondary" onClick={load} disabled={busy}>{busy ? <><LoaderCircle size={14} className="spinning" /> Loading context…</> : result || error ? 'Refresh asset context' : 'Load asset context'}</button>
    {(error || result?.message) && <p className={styles.note} role="status">{error || result?.message}</p>}
    {details && <div className={styles.context} data-asset-context={asset.mint}>
      {result.state !== 'success' && <p className={styles.state}>{result.state === 'stale' ? 'Older context · not a current market snapshot' : 'Some context is unavailable'}</p>}
      <dl>{details.canonicalName && <div><dt>Canonical asset</dt><dd>{details.canonicalName}</dd></div>}{details.issuer && <div><dt>Issuer</dt><dd>{details.issuer}</dd></div>}{details.representation && <div><dt>This representation</dt><dd>{details.representation}</dd></div>}{details.kind && <div><dt>Representation type</dt><dd>{details.kind}</dd></div>}{details.liquidityUsd !== undefined && <div><dt>Liquidity for this mint</dt><dd>{new Intl.NumberFormat('en-US',{ style:'currency',currency:'USD',maximumFractionDigits:2 }).format(details.liquidityUsd)}</dd></div>}{details.snapshotFetchedAt && <div><dt>Provider snapshot fetched</dt><dd><time dateTime={details.snapshotFetchedAt}>{new Date(details.snapshotFetchedAt).toISOString().replace('T',' ').replace('.000Z',' UTC')}</time></dd></div>}{details.activityAsOf && <div><dt>Trading activity as of</dt><dd><time dateTime={details.activityAsOf}>{new Date(details.activityAsOf).toISOString().replace('T',' ').replace('.000Z',' UTC')}</time></dd></div>}</dl>
      {details.advisory && <p className={styles.note}>{details.advisory.status}: {details.advisory.reason}</p>}
      <a className="text-button" href={details.sourceUrl} target="_blank" rel="noopener noreferrer">View source on Tokens.xyz <ArrowUpRight size={13} /><span className="sr-only"> (opens in a new tab)</span></a>
    </div>}
    <p className={styles.note}>Supplementary context from Tokens.xyz. It does not change your allocations, issuer verification, or quote expiry. Snapshot retrieval and trading activity times are not liquidity observation times.</p>
  </>;
}

export function AssetDetails({ assets, mode }: { assets: Asset[]; mode: Mode }) {
  const id = useId();
  const [chosen, setChosen] = useState('');
  const asset = assets.find(candidate => candidate.mint === chosen) ?? assets[0];
  if (!asset) return null;
  return <details className={styles.panel}><summary><Info size={14} /><span>About your selected assets</span><small>Optional context</small></summary><div className={styles.body}><label htmlFor={id}>Asset context</label><select id={id} value={asset.mint} onChange={event => setChosen(event.target.value)}>{assets.map(candidate => <option value={candidate.mint} key={candidate.mint}>{candidate.symbol} · {candidate.name}</option>)}</select><ContextResult key={`${mode}:${asset.mint}`} asset={asset} mode={mode} /></div></details>;
}
