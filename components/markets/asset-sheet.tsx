'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Check, Clipboard, ExternalLink, LoaderCircle, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { BACKPACK_UNDERLYINGS } from '@/lib/domain/rails';
import { jupiterReviewUrl } from '@/lib/domain/jupiter';
import { CHART_RANGES, chartFromResponse, formatMarketChange, formatMarketCount, formatMarketPrice, formatMarketUsd, marketDirection, marketTypeLabel, type ChartRange, type ChartResponse, type MarketRow } from '@/lib/domain/markets';
import { cryptoIdentity } from '@/lib/domain/crypto-assets';
import type { VersionGroup } from '@/lib/domain/market-themes';
import { utcTime } from '../verification-receipt';
import { PriceChart } from './price-chart';
import styles from './markets.module.css';

const RANGE_LABELS: Record<ChartRange, string> = { '1d': 'last day', '7d': 'last 7 days', '30d': 'last 30 days' };
const MAX_CHART_DISAGREEMENT = 0.25;
type ChartState = { range: ChartRange; loading: boolean; data: ChartResponse | null };

export function ChangeBadge({ value }: { value: number | null }) {
  const direction = marketDirection(value);
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  return <span className={styles.change} data-direction={direction}>{direction !== 'none' && <Icon size={12} aria-hidden="true" />}{formatMarketChange(value)}<span className="sr-only">{direction === 'up' ? ' up' : direction === 'down' ? ' down' : ''} over 24 hours</span></span>;
}

type Props = {
  row: MarketRow | null;
  /** Other tokens for the same company, or funds with the same exposure, including this row. */
  versions: { group: VersionGroup; rows: MarketRow[] } | null;
  snapshotTime: string | null;
  inPlan: boolean;
  onAdd: (mint: string) => void;
  /** Switches the open sheet to another asset without closing it. */
  onSelect: (mint: string) => void;
  onClose: () => void;
};

function leverageNote(leverage: string): string {
  const inverse = leverage.startsWith('−');
  return `Seeks ${leverage} of one day’s move in what it tracks${inverse ? ', in the opposite direction' : ''}. The multiple resets daily, so over longer periods its return can differ widely from ${leverage} of that return.`;
}

/** Details for one catalog asset: dated market context, verified identity and the add-to-plan action. */
export function AssetSheet({ row, versions, snapshotTime, inPlan, onAdd, onSelect, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<ChartState>({ range: '1d', loading: false, data: null });
  // Bumped by Retry to ask for the same chart once more.
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const mint = row?.mint ?? null;
  const range = chart.range;

  // Opening only: closing here would fire onClose and dismiss the sheet when switching between versions.
  // With no row the component renders nothing, which removes the dialog.
  useEffect(() => {
    const element = dialog.current;
    if (!element || !mint) return;
    if (!element.open) element.showModal();
    body.current?.scrollTo({ top: 0 });
  }, [mint]);

  useEffect(() => {
    if (!mint) return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setChart(previous => ({ ...previous, loading: true, data: previous.data?.mint === mint && previous.data.range === range ? previous.data : null })); });
    fetch(`/api/markets/chart?mint=${encodeURIComponent(mint)}&range=${range}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then(async response => {
        const body: unknown = await response.json().catch(() => null);
        if (!controller.signal.aborted) setChart({ range, loading: false, data: chartFromResponse(response.status, body, mint, range) });
      })
      .catch(() => { if (!controller.signal.aborted) setChart({ range, loading: false, data: chartFromResponse(0, null, mint, range) }); });
    return () => controller.abort();
  }, [mint, range, attempt]);

  async function copyMint() {
    if (!mint) return;
    try { await navigator.clipboard.writeText(mint); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }

  if (!row) return null;
  const stats = row.stats;
  const planPath = row.universe === 'prestocks' ? '/pre-ipo' : '/app';
  const jupiter = jupiterReviewUrl(row.mint);
  const onBackpack = row.issuer === 'xStocks' && row.underlyingSymbol !== null && (BACKPACK_UNDERLYINGS as readonly string[]).includes(row.underlyingSymbol);
  const coin = row.category === 'crypto' ? cryptoIdentity(row.mint) : undefined;
  const charted = chart.data?.state === 'success' && chart.data.mint === row.mint && chart.data.range === range ? chart.data.points : [];
  // A pool whose latest close is far from the market snapshot is not drawn: the two would contradict each other.
  const lastClose = charted.at(-1)?.c;
  const disagrees = lastClose !== undefined && typeof stats?.price === 'number' && stats.price > 0 && Math.abs(lastClose - stats.price) / stats.price > MAX_CHART_DISAGREEMENT;
  const points = disagrees ? [] : charted;
  return (
    <dialog ref={dialog} className={styles.sheet} aria-labelledby="asset-sheet-title" aria-describedby="asset-sheet-note" onClose={onClose} onCancel={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={body} className={styles.sheetBody}>
        <div className={styles.sheetGrip} aria-hidden="true" />
        <header className={styles.sheetHeader}>
          <span className={styles.logo} aria-hidden="true"><Image src={row.logoUrl} alt="" width={44} height={44} unoptimized /></span>
          <div>
            <p className={styles.sheetEyebrow}>{row.issuer} · {marketTypeLabel(row)}</p>
            <h2 id="asset-sheet-title">{row.name}</h2>
            <p className={styles.sheetSymbol}>{row.symbol}{row.underlyingSymbol ? ` · tracks ${row.underlyingSymbol}` : ''}</p>
          </div>
          <button type="button" className={styles.closeButton} aria-label="Close details" onClick={onClose}><X size={18} /></button>
        </header>

        <div className={styles.priceBlock}>
          <strong>{formatMarketPrice(stats?.price)}</strong>
          <ChangeBadge value={stats?.change24hPct ?? null} />
        </div>
        {row.leverage && <p className={styles.leverageNote} role="note">{leverageNote(row.leverage)}</p>}

        <div className={styles.rangeTabs} role="group" aria-label="Chart range">
          {CHART_RANGES.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setChart(previous => ({ ...previous, range: value }))}>{value.toUpperCase()}</button>)}
        </div>
        <div className={styles.chartArea} aria-busy={chart.loading} aria-live="polite">
          {points.length > 1 ? <PriceChart points={points} rangeLabel={RANGE_LABELS[range]} />
            : chart.loading ? <p className={styles.chartState}><LoaderCircle size={15} className="spinning" aria-hidden="true" />Loading price history…</p>
              : <p className={styles.chartState}>
                {disagrees ? 'This pool’s recent prices disagree with the market snapshot, so no chart is shown.' : chart.data?.message ?? 'No price history for this range.'}
                {!disagrees && chart.data?.state === 'unavailable' && chart.data.retryable && <button type="button" className={styles.retryButton} onClick={() => setAttempt(value => value + 1)}>Retry <RefreshCw size={12} aria-hidden="true" /></button>}
              </p>}
        </div>
        {chart.data?.state === 'success' && chart.data.pool && !disagrees && <p className={styles.chartSource}>USD closing prices per displayed unit, from GeckoTerminal · pool {chart.data.pool.name}</p>}

        <dl className={styles.statGrid}>
          <div><dt>24h volume</dt><dd>{formatMarketUsd(stats?.volume24hUsd)}</dd></div>
          <div><dt>Liquidity</dt><dd>{formatMarketUsd(stats?.liquidityUsd)}</dd></div>
          <div><dt>Market cap</dt><dd>{formatMarketUsd(stats?.marketCapUsd)}</dd></div>
          <div><dt>Holders</dt><dd>{formatMarketCount(stats?.holders)}</dd></div>
        </dl>

        <dl className={styles.identity}>
          <div><dt>Solana mint</dt><dd><code>{row.mint}</code><button type="button" className={styles.copyButton} onClick={copyMint} aria-label={`Copy the ${row.symbol} mint address`}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy'}</button></dd></div>
          <div><dt>Issuer</dt><dd>{coin ? `${coin.issuer}, pinned mint checked on-chain${coin.freezable ? ' · the issuer can freeze balances' : ''}` : row.issuer === 'xStocks' ? 'xStocks (Backed), pinned issuer identity' : 'PreStocks, pinned issuer identity'}</dd></div>
          {coin ? <div><dt>Backed by</dt><dd>{coin.backing}</dd></div>
            : row.underlyingSymbol && <div><dt>Underlying</dt><dd>{row.underlyingSymbol} · {row.listing === 'HK' ? 'Hong Kong listing' : 'US listing'}{row.category === 'etfs' ? ' · ETF per Nasdaq’s symbol directory' : ''}</dd></div>}
          {onBackpack && <div><dt>Also trades</dt><dd>On Backpack as {row.underlyingSymbol}; the planner shows that venue’s price beside Jupiter’s estimate.</dd></div>}
        </dl>

        {versions && <section className={styles.versions} aria-labelledby="asset-versions-title">
          <h3 id="asset-versions-title">{versions.group.kind === 'company' ? `Other ways to hold ${versions.group.label}` : `Similar exposure · ${versions.group.label}`}</h3>
          <ul>{versions.rows.filter(other => other.mint !== row.mint).map(other => <li key={other.mint}>
            <button type="button" onClick={() => onSelect(other.mint)} aria-label={`Open ${other.symbol}, ${other.name}`}>
              <span className={styles.logo} aria-hidden="true"><Image src={other.logoUrl} alt="" width={30} height={30} unoptimized /></span>
              <span className={styles.versionText}><strong>{other.symbol}</strong><small>{other.issuer} · {marketTypeLabel(other)}</small></span>
              <span className={styles.versionPrice}>{formatMarketPrice(other.stats?.price)}</span>
              <ChangeBadge value={other.stats?.change24hPct ?? null} />
            </button>
          </li>)}</ul>
          <p>{versions.group.kind === 'company' ? 'Different issuers and products for the same company. Each has its own terms, rights and liquidity.' : 'Different funds following the same index or segment. Holdings, costs and leverage differ; read each issuer’s documents.'}</p>
        </section>}

        <p id="asset-sheet-note" className={styles.sheetNote}>{snapshotTime ? `Market snapshot from Jupiter at ${utcTime(snapshotTime)}. ` : 'Market figures are unavailable right now. '}Not a quote: the planner requests a fresh estimate for your exact amount.</p>

        <div className={styles.sheetActions}>
          <button type="button" className="button primary" disabled={inPlan} onClick={() => onAdd(row.mint)}>{inPlan ? <><Check size={15} />In your plan</> : <><Plus size={15} />Add to plan</>}</button>
          <Link className="button secondary" href={planPath}>Open {row.universe === 'prestocks' ? 'PreStocks plan' : 'plan'}</Link>
          {jupiter && <a className={styles.textLink} href={jupiter} target="_blank" rel="noopener noreferrer">View on Jupiter <ExternalLink size={13} /></a>}
        </div>
      </div>
    </dialog>
  );
}
