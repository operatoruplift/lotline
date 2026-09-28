'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Asset, Mode, QuotesResponse } from '@/lib/domain/types';
import { RAIL_COPY, backpackListed, isRailFresh, type RailComparison, type RailsResponse } from '@/lib/domain/rails';
import { utcTime } from './verification-receipt';
import styles from './market-reference.module.css';

type Props = {
  assets: readonly Asset[];
  quotes: QuotesResponse | null;
  mode: Mode;
  planIdentity: string;
  now: number;
  enabled: boolean;
};
type Result = { key: string; data?: RailsResponse; error?: string };

const bps = (value: string) => `${value.startsWith('-') ? '' : '+'}${(Number(value) / 100).toFixed(2)}%`;

/**
 * Where Backpack Securities tokenizes the same underlying as a selected xStock,
 * its venue tape is shown beside the Jupiter estimate. A comparison of two
 * different tokens for one company; nothing here is a route or an order.
 */
export function RailComparison({ assets, quotes, mode, planIdentity, now, enabled }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const candidates = (quotes?.quotes ?? []).filter(quote => quote.state === 'success' && backpackListed(assets.find(asset => asset.mint === quote.mint)?.symbol ?? ''));
  const itemKey = JSON.stringify(candidates.map(quote => [quote.mint, quote.usdcRaw, quote.units]));
  const requestKey = enabled && mode === 'live' && candidates.length ? JSON.stringify([planIdentity, itemKey, refresh]) : '';

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    const items = (JSON.parse(itemKey) as [string, string, string | null][]).map(([mint, usdcRaw, units]) => ({ mint, usdcRaw, units }));
    void (async () => {
      try {
        const response = await fetch('/api/rails', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }), cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Invalid venue response.');
        const data = await response.json() as RailsResponse;
        if (!response.ok || data.state !== 'success') throw new Error(data.message || 'Venue prices could not be verified.');
        const requested = new Set(items.map(item => item.mint));
        if (data.items.some(item => !requested.has(item.mint) || item.venue !== 'backpack')) throw new Error('Unverified venue response.');
        if (!controller.signal.aborted) setResult({ key: requestKey, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key: requestKey, error: error instanceof Error ? error.message : 'Venue prices could not be verified.' });
      }
    })();
    return () => controller.abort();
  }, [requestKey, itemKey]);

  if (!requestKey) return null;
  const current = result?.key === requestKey ? result : null;
  const pending = current === null;
  const items = current?.data?.items ?? [];
  const symbolFor = (mint: string) => assets.find(asset => asset.mint === mint)?.symbol ?? mint.slice(0, 6);

  return <section className={styles.panel} aria-labelledby="rail-comparison-title" data-rail-comparison>
    <div className={styles.heading}>
      <div>
        <p className={styles.eyebrow}><ArrowLeftRight size={14} />OTHER VENUES · BACKPACK SECURITIES</p>
        <h3 id="rail-comparison-title">Compare the venue price for the same company.</h3>
      </div>
      <button type="button" className={styles.refresh} disabled={pending} onClick={() => setRefresh(value => value + 1)} aria-label="Refresh venue prices">
        <RefreshCw size={15} />Refresh venue prices
      </button>
    </div>
    <p className={styles.intro}>{RAIL_COPY.scope}</p>
    {pending
      ? <p className={styles.status} role="status"><LoaderCircle size={16} className="spinning" />Reading the venue tape…</p>
      : items.length === 0
        ? <p className={styles.status} role="status">{current?.error ?? current?.data?.message ?? 'No venue price is listed for this selection today.'}</p>
        : <div className={styles.assets}>{items.map((item: RailComparison) => {
            const fresh = isRailFresh(item, now);
            return <div className={styles.asset} key={item.mint} data-rail-mint={item.mint}>
              <div className={styles.assetHeading}>
                <strong>{symbolFor(item.mint)} · {item.underlying}</strong>
                <span className={fresh ? styles.current : styles.stale}>{fresh ? 'Current read' : 'Earlier read'}</span>
                <time className={styles.detail} dateTime={item.fetchedAt}>{utcTime(item.fetchedAt)}</time>
              </div>
              <div className={styles.prices}>
                <div className={styles.observation}>
                  <span className={styles.label}>Backpack venue · last trade {item.venueSymbol}</span>
                  <strong className={styles.price}>${item.venueLastPrice} <small>USDC</small></strong>
                  <span className={styles.detail}>{item.thin ? RAIL_COPY.thin(item.venueTrades) : `${item.venueTrades} venue trades in the last day.`}</span>
                </div>
                <div className={styles.observation}>
                  <span className={styles.label}>Lotline estimate · Jupiter, per {symbolFor(item.mint)} unit</span>
                  <strong className={styles.price}>{item.impliedUsdcPerUnit ? <>${item.impliedUsdcPerUnit} <small>USDC</small></> : 'Unavailable'}</strong>
                  <span className={styles.detail}>{item.differenceBps ? `${bps(item.differenceBps)} against the venue's last trade. Estimates are read-only and expire with the quote.` : 'This estimate has no unit count to compare.'}</span>
                </div>
              </div>
              <a className={styles.detail} href={item.tradeUrl} target="_blank" rel="noreferrer noopener">Venue market {item.venueSymbol} <ExternalLink size={13} /></a>
            </div>;
          })}</div>}
    <p className={styles.note}>{RAIL_COPY.account}</p>
    <p className={styles.source}>Backpack Exchange public market data, no account</p>
  </section>;
}
