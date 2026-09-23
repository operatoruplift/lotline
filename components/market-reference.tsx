'use client';

import { useEffect, useState } from 'react';
import { Activity, Clock3, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Asset, Mode, QuotesResponse } from '@/lib/domain/types';
import { isPythObservationFresh, marketReferenceResponseSchema, type MarketReferenceResponse } from '@/lib/domain/market-reference';
import { utcTime } from './verification-receipt';
import styles from './market-reference.module.css';

type Observation = NonNullable<MarketReferenceResponse['items'][number]['underlying']>;
type Props = {
  assets: readonly Asset[];
  quotes: QuotesResponse | null;
  mode: Mode;
  planIdentity: string;
  now: number;
  enabled: boolean;
  onData?: (data: MarketReferenceResponse | null) => void;
};
type Result = { key: string; data?: MarketReferenceResponse; error?: string };

function ObservationCard({ observation, label, now }: { observation?: Observation; label: string; now: number }) {
  const stale = observation && (observation.state === 'stale' || !isPythObservationFresh(observation, now));
  return <div className={styles.observation}>
    <span className={styles.label}>{label}</span>
    {observation ? <>
      <strong className={styles.price}>${observation.displayPrice} <small>USD</small></strong>
      <span className={stale ? styles.stale : styles.current}>{stale ? 'Stale reference' : 'Fresh reference'}</span>
      <span className={styles.detail}>Reported confidence ±${observation.displayConfidence}</span>
      <time className={styles.detail} dateTime={observation.publishedAt}>{utcTime(observation.publishedAt)}</time>
      <details className={styles.feed}><summary>Feed identity</summary><p>{observation.symbol}</p><code>{observation.feedId}</code></details>
    </> : <p className={styles.detail}>No verified reference is available.</p>}
  </div>;
}

/** Oracle observations never replace a quote, renew it, or authorize a purchase. */
export function MarketReference({ assets, quotes, mode, planIdentity, now, enabled, onData }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const successful = quotes?.quotes.filter(quote => quote.state === 'success') ?? [];
  const mintKey = JSON.stringify(successful.map(quote => quote.mint).sort());
  const requestKey = enabled && mode === 'live' && successful.length
    ? JSON.stringify([planIdentity, successful.map(quote => [quote.mint, quote.usdcRaw, quote.outRaw, quote.units, quote.fetchedAt]), refresh]) : '';

  useEffect(() => {
    onData?.(null);
    if (!requestKey) {
      return;
    }
    const controller = new AbortController();
    const mints = JSON.parse(mintKey) as string[];
    void (async () => {
      try {
        const response = await fetch('/api/market-reference', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mints }),
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Invalid reference response.');
        const parsed = marketReferenceResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Invalid reference response.');
        const data = parsed.data;
        const returned = data.items.map(item => item.mint);
        if (new Set(returned).size !== returned.length || returned.some(mint => !mints.includes(mint))
          || (['success', 'partial', 'stale'].includes(data.state) && returned.length !== mints.length)
          || (!response.ok && data.items.some(item => item.underlying || item.token))) throw new Error('Unverified reference response.');
        if (!controller.signal.aborted) { setResult({ key: requestKey, data }); onData?.(data); }
      } catch {
        if (!controller.signal.aborted) { setResult({ key: requestKey, error: 'Pyth market references could not be verified. Your contribution estimates are still available.' }); onData?.(null); }
      }
    })();
    return () => controller.abort();
  }, [requestKey, mintKey, onData]);

  if (!requestKey) return null;
  const current = result?.key === requestKey ? result : null;
  const pending = current === null;
  const data = current?.data;
  const hasObservations = data?.items.some(item => item.underlying || item.token);
  const quoteExpired = successful.some(quote => now >= Math.min(Date.parse(quote.expiresAt), Date.parse(quote.fetchedAt) + 30_000));
  return <section className={styles.panel} aria-labelledby="market-reference-title" data-market-reference>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}><Activity size={14} />PYTH MARKET DATA</p><h3 id="market-reference-title">Put the estimate in context.</h3></div>
      <button type="button" className={styles.refresh} disabled={pending} onClick={() => setRefresh(value => value + 1)} aria-label="Refresh market references"><RefreshCw size={15} />Refresh references</button>
    </div>
    <p className={styles.intro}>See the underlying equity and token reference side by side, with their original publication times. The cross-feed ratio is context only; your amount-specific Jupiter estimate remains the execution estimate.</p>
    {pending ? <p className={styles.status} role="status"><LoaderCircle size={16} className="spinning" />Checking reference freshness…</p> : !hasObservations ? <p className={styles.status} role="status">{current?.error ?? 'Pyth market data is currently unavailable. Your Jupiter estimates remain available; no reference-price check is claimed.'}</p> : <>
      {quoteExpired && <p className={styles.warning} role="status"><Clock3 size={16} />Your contribution estimate expired. Refresh estimates before reviewing these observations together.</p>}
      <div className={styles.assets}>{data!.items.map(item => {
        const asset = assets.find(candidate => candidate.mint === item.mint);
        const observations = [item.underlying, item.token].filter((value): value is Observation => Boolean(value));
        const stale = observations.some(observation => observation.state === 'stale' || !isPythObservationFresh(observation, now));
        return <article key={item.mint} className={styles.asset} data-reference-mint={item.mint}>
          <div className={styles.assetHeading}><h4>{asset?.symbol ?? 'Selected asset'} <span>{asset?.name}</span></h4><span className={stale || !observations.length ? styles.stale : styles.current}>{!observations.length ? 'Reference unavailable' : stale ? 'Reference check stale' : 'Reference data current'}</span></div>
          {observations.length ? <><div className={styles.prices}><ObservationCard observation={item.underlying} label="Underlying equity · per share" now={now} /><ObservationCard observation={item.token} label="Token feed · unit basis unverified" now={now} /></div>{!stale && item.comparison === 'cross-feed-context' && item.comparisonRatio && <p className={styles.comparison} data-reference-comparison>Feed-price ratio: approximately {item.comparisonRatio}× (token USD feed ÷ equity USD feed, rounded down to eight decimal places). The feed units are not verified as equivalent, so this is context only.</p>}</> : <p className={styles.detail}>{item.message ?? 'No verified reference is available for this selection.'}</p>}
        </article>;
      })}</div>
      <p className={styles.note}>Mapped assets require fresh equity and token feeds for purchase review. Equity feeds can stop updating outside market hours. The ratio does not establish a premium, fair value, or execution price. Refreshing references never refreshes an older quote.</p>
    </>}
    <a className={styles.source} href="https://docs.pyth.network/price-feeds" target="_blank" rel="noopener noreferrer">About Pyth price data <ExternalLink size={12} /></a>
  </section>;
}
