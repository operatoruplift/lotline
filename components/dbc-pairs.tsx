'use client';

import { useEffect, useState } from 'react';
import { Coins, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Asset, Mode, QuotesResponse } from '@/lib/domain/types';
import {
  DBC_COPY,
  DBC_MAX_ITEMS,
  DBC_PROGRAM_ID,
  abbreviateAddress,
  dbcResponseSchema,
  isDbcReadFresh,
  type DbcItem,
  type DbcPool,
  type DbcResponse,
} from '@/lib/domain/dbc';
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
type Result = { key: string; data?: DbcResponse; error?: string };

const bps = (value: number) => `${(value / 100).toFixed(2)}%`;
const explorer = (address: string) => `https://solscan.io/account/${address}`;

function PoolRow({ pool, symbol }: { pool: DbcPool; symbol: string }) {
  return <div className={styles.observation}>
    <span className={styles.label}>Launch token {abbreviateAddress(pool.baseMint)}</span>
    <strong className={styles.price}>{bps(pool.progressBps)} <small>of migration threshold</small></strong>
    <span className={styles.detail}>
      {pool.estimate ? <>Fee at this read {bps(pool.estimate.feeBps)}</> : <>Launch fee {bps(pool.cliffFeeBps)}</>}
      {' · reserve '}{pool.quoteReserveRaw} raw {symbol}
    </span>
    {pool.estimate
      ? <span className={styles.detail}>
          {pool.estimate.amountInRaw} raw {symbol} would price {pool.estimate.outRaw} raw launch units at this read,
          charged on the {pool.estimate.feeSide} side.
          {pool.cliffFeeBps !== pool.estimate.feeBps && <> This curve opened at {bps(pool.cliffFeeBps)} and its schedule has brought the fee down since launch.</>}
        </span>
      : <span className={styles.detail}>{pool.message ?? 'This curve has migrated off the bonding curve, so it prices through its graduated pool.'}</span>}
    <a className={styles.detail} href={explorer(pool.pool)} target="_blank" rel="noreferrer noopener">
      Pool {abbreviateAddress(pool.pool)} <ExternalLink size={13} />
    </a>
  </div>;
}

function ItemCard({ item, symbol, now }: { item: DbcItem; symbol: string; now: number }) {
  const stale = !isDbcReadFresh(item, now);
  return <div className={styles.asset}>
    <div className={styles.assetHeading}>
      <strong>{symbol}</strong>
      <span className={stale ? styles.stale : styles.current}>{stale ? 'Earlier read' : 'Current read'}</span>
      <time className={styles.detail} dateTime={item.fetchedAt}>{utcTime(item.fetchedAt)} · slot {item.slot}</time>
    </div>
    <p className={styles.detail}>{item.quoteToken ? DBC_COPY.quoteToken(symbol) : DBC_COPY.noBadge(symbol)}</p>
    {item.quoteToken && <p className={styles.detail}>
      {item.configCount} curve {item.configCount === 1 ? 'config quotes' : 'configs quote'} in {symbol}.
      This read opened {item.configsProbed} of them.
    </p>}
    {item.pools.length
      ? <div className={styles.prices}>{item.pools.map(pool => <PoolRow key={pool.pool} pool={pool} symbol={symbol} />)}</div>
      : item.quoteToken && <p className={styles.detail}>{DBC_COPY.noPools(symbol)}</p>}
    {item.message && <p className={styles.detail}>{item.message}</p>}
    <p className={styles.source}>{item.source}</p>
  </div>;
}

/**
 * Meteora DBC context for a selected xStock. DBC launch pools quote in the
 * xStock; they do not sell it, so this panel never competes with the Jupiter
 * estimate beside it and never offers a purchase path.
 */
export function DbcPairs({ assets, quotes, mode, planIdentity, now, enabled }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const successful = (quotes?.quotes.filter(quote => quote.state === 'success' && quote.outRaw) ?? []).slice(0, DBC_MAX_ITEMS);
  const itemKey = JSON.stringify(successful.map(quote => [quote.mint, quote.outRaw]));
  const requestKey = enabled && mode === 'live' && successful.length
    ? JSON.stringify([planIdentity, itemKey, refresh]) : '';

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    const items = (JSON.parse(itemKey) as [string, string][]).map(([mint, quoteRaw]) => ({ mint, quoteRaw }));
    void (async () => {
      try {
        const response = await fetch('/api/dbc/quotes', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }),
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Invalid DBC response.');
        const parsed = dbcResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Invalid DBC response.');
        const data = parsed.data;
        const requested = items.map(item => item.mint);
        const returned = data.items.map(item => item.mint);
        // A read is only shown when it answers exactly the mints this plan asked about.
        if (new Set(returned).size !== returned.length || returned.some(mint => !requested.includes(mint))) throw new Error('Unverified DBC response.');
        if (!controller.signal.aborted) setResult({ key: requestKey, data });
      } catch {
        if (!controller.signal.aborted) setResult({ key: requestKey, error: 'Meteora DBC curve reads could not be verified for this plan. Your contribution estimates are still available.' });
      }
    })();
    return () => controller.abort();
  }, [requestKey, itemKey]);

  if (!requestKey) return null;
  const current = result?.key === requestKey ? result : null;
  const pending = current === null;
  const data = current?.data;
  const shown = data?.items ?? [];
  const symbolFor = (mint: string) => assets.find(asset => asset.mint === mint)?.symbol ?? abbreviateAddress(mint);
  const lead = shown.find(item => item.quoteToken);

  return <section className={styles.panel} aria-labelledby="dbc-pairs-title" data-dbc-pairs>
    <div className={styles.heading}>
      <div>
        <p className={styles.eyebrow}><Coins size={14} />METEORA DYNAMIC BONDING CURVES</p>
        <h3 id="dbc-pairs-title">See where your asset prices other tokens.</h3>
      </div>
      <button type="button" className={styles.refresh} disabled={pending} onClick={() => setRefresh(value => value + 1)} aria-label="Refresh Meteora DBC reads">
        <RefreshCw size={15} />Refresh curve reads
      </button>
    </div>
    <p className={styles.intro}>{DBC_COPY.role(lead ? symbolFor(lead.mint) : 'your asset')} {DBC_COPY.scope}</p>
    {pending
      ? <p className={styles.status} role="status"><LoaderCircle size={16} className="spinning" />Reading Meteora curve configs…</p>
      : !shown.length
        ? <p className={styles.status} role="status">{current?.error ?? DBC_COPY.noBadge(lead ? symbolFor(lead.mint) : 'This asset')}</p>
        : <>
            <div className={styles.assets}>{shown.map(item => <ItemCard key={item.mint} item={item} symbol={symbolFor(item.mint)} now={now} />)}</div>
            <p className={styles.note}>{DBC_COPY.thin}</p>
          </>}
    <p className={styles.note}>{DBC_COPY.readOnly}</p>
    <p className={styles.source}>Meteora Dynamic Bonding Curve program {abbreviateAddress(DBC_PROGRAM_ID)}</p>
  </section>;
}
