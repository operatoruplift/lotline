'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Clock3, Info, LoaderCircle, Plus, RefreshCw, Search, X } from 'lucide-react';
import { addToDraft, draftMints } from '@/lib/client/plan-draft';
import {
  categoryCounts, filterMarkets, formatMarketPrice, formatMarketUsd, MARKET_FILTERS, MARKET_IDENTITIES, MARKET_SORTS, marketRows,
  MARKETS_PAGE_SIZE, pageOf, sortMarkets, type MarketFilter, type MarketSnapshot, type MarketSort,
} from '@/lib/domain/markets';
import { SiteFooter, SiteHeader } from '../site-shell';
import { utcTime } from '../verification-receipt';
import { AssetSheet, ChangeBadge } from './asset-sheet';
import styles from './markets.module.css';

const FILTER_LABELS: Record<MarketFilter, string> = { all: 'All', stocks: 'Stocks', etfs: 'ETFs', 'pre-ipo': 'Pre-IPO' };
const SORT_LABELS: Record<MarketSort, string> = { volume: 'Most traded, 24h', gainers: 'Top gainers, 24h', losers: 'Top losers, 24h', liquidity: 'Deepest liquidity', name: 'Name', price: 'Price' };
type Load = { state: 'loading' } | { state: 'ready'; snapshot: MarketSnapshot } | { state: 'failed'; message: string };
type Notice = { text: string; error?: boolean; href?: string };
type View = { filter: MarketFilter; sort: MarketSort; query: string; page: number; asset: string | null };
const DEFAULT_VIEW: View = { filter: 'all', sort: 'volume', query: '', page: 1, asset: null };

function readView(search: string): View {
  const params = new URLSearchParams(search);
  const filter = params.get('category') as MarketFilter | null;
  const sort = params.get('sort') as MarketSort | null;
  const page = Number(params.get('page'));
  const asset = params.get('asset');
  return {
    filter: filter && MARKET_FILTERS.includes(filter) ? filter : 'all',
    sort: sort && MARKET_SORTS.includes(sort) ? sort : 'volume',
    query: (params.get('q') ?? '').slice(0, 64),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    asset: asset && MARKET_IDENTITIES.some(identity => identity.mint === asset) ? asset : null,
  };
}

function writeView(view: View) {
  const params = new URLSearchParams();
  if (view.filter !== 'all') params.set('category', view.filter);
  if (view.sort !== 'volume') params.set('sort', view.sort);
  if (view.query) params.set('q', view.query);
  if (view.page > 1) params.set('page', String(view.page));
  if (view.asset) params.set('asset', view.asset);
  const search = params.toString();
  window.history.replaceState(null, '', search ? `/markets?${search}` : '/markets');
}

function validSnapshot(value: unknown): value is MarketSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MarketSnapshot>;
  const number = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return (candidate.state === 'success' || candidate.state === 'partial') && typeof candidate.fetchedAt === 'string' && Number.isFinite(Date.parse(candidate.fetchedAt)) &&
    !!candidate.stats && typeof candidate.stats === 'object' && Object.values(candidate.stats).every(stats => !!stats && typeof stats === 'object' &&
      number(stats.price) && number(stats.change24hPct) && number(stats.volume24hUsd) && number(stats.liquidityUsd) && number(stats.marketCapUsd) && number(stats.holders));
}

/** Browse the verified catalog with a dated market snapshot, open an asset, add it to a device draft. */
export function Markets() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [restored, setRestored] = useState(false);
  const [inPlan, setInPlan] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);

  const refreshDrafts = useCallback(() => {
    try { setInPlan(draftMints(window.localStorage)); } catch { setInPlan(new Set()); }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { setView(readView(window.location.search)); setRestored(true); refreshDrafts(); });
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith('lotline:')) refreshDrafts(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshDrafts]);

  useEffect(() => { if (restored) writeView(view); }, [restored, view]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/markets', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) })
      .then(async response => {
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (response.ok && validSnapshot(body)) setLoad({ state: 'ready', snapshot: body });
        else setLoad({ state: 'failed', message: body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : 'Market data is temporarily unavailable.' });
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'failed', message: 'Market data could not be loaded. Check your connection and retry.' }); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const snapshot = load.state === 'ready' ? load.snapshot : null;
  const rows = useMemo(() => marketRows(snapshot), [snapshot]);
  const counts = useMemo(() => categoryCounts(MARKET_IDENTITIES), []);
  const filtered = useMemo(() => sortMarkets(filterMarkets(rows, view.filter, view.query), view.sort), [rows, view.filter, view.query, view.sort]);
  const page = pageOf(filtered, view.page);
  const selected = view.asset ? rows.find(row => row.mint === view.asset) ?? null : null;
  const change = (patch: Partial<View>) => setView(current => ({ ...current, ...patch, page: patch.page ?? (patch.filter !== undefined || patch.sort !== undefined || patch.query !== undefined ? 1 : current.page) }));

  function add(mint: string) {
    let result: ReturnType<typeof addToDraft>;
    try { result = addToDraft(window.localStorage, mint); } catch { result = { ok: false, reason: 'storage' }; }
    refreshDrafts();
    if (result.ok) setNotice({ text: `${result.symbol} added to your plan at ${result.percent}%. Set its share in the planner.`, href: result.path });
    else if (result.reason === 'duplicate') setNotice({ text: `${result.symbol} is already in your plan.`, href: result.path });
    else if (result.reason === 'full') setNotice({ text: 'Your plan already has 10 assets. Remove one in the planner to add another.', error: true, href: result.path });
    else setNotice({ text: 'This browser could not save your plan. Check that site storage is allowed.', error: true });
  }

  const status = load.state === 'loading' ? 'Reading the market snapshot…'
    : load.state === 'failed' ? `${load.message} Names, identities and adding to a plan still work.`
      : `Snapshot from Jupiter at ${utcTime(load.snapshot.fetchedAt)}${load.snapshot.stale ? ' (refreshing)' : ''} · not a quote${load.snapshot.missing ? ` · ${load.snapshot.missing} without figures` : ''}`;

  return <>
    <SiteHeader active="markets" markets />
    <main id="main" className={`page-width ${styles.page}`}>
      <div className={styles.heading}>
        <p className="eyebrow">MARKETS · VERIFIED CATALOG</p>
        <h1>Find what goes in your next contribution.</h1>
        <p>Every xStock and PreStock Lotline verifies, with a dated market snapshot beside it. Add an asset to your plan; the split, the amount and the decision stay yours.</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Asset type">
          {MARKET_FILTERS.map(filter => <button key={filter} type="button" aria-pressed={view.filter === filter} onClick={() => change({ filter })}>{FILTER_LABELS[filter]}<span>{counts[filter]}</span></button>)}
        </div>
        <div className={styles.controls}>
          <label className={styles.search}><span className="sr-only">Search markets</span><Search size={16} aria-hidden="true" />
            <input type="search" value={view.query} placeholder="Company, ticker or mint" autoComplete="off" maxLength={64} onChange={event => change({ query: event.target.value })} />
            {view.query && <button type="button" aria-label="Clear search" onClick={() => change({ query: '' })}><X size={14} /></button>}
          </label>
          <label className={styles.sort}><span>Sort</span>
            <select value={view.sort} onChange={event => change({ sort: event.target.value as MarketSort })}>{MARKET_SORTS.map(sort => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}</select>
          </label>
        </div>
      </div>

      <div className={styles.status} data-state={load.state} role="status" aria-live="polite">
        {load.state === 'loading' ? <LoaderCircle size={14} className="spinning" aria-hidden="true" /> : load.state === 'failed' ? <Info size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
        <span>{status}</span>
        {load.state === 'failed' && <button type="button" onClick={() => { setLoad({ state: 'loading' }); setReload(value => value + 1); }}>Retry <RefreshCw size={12} /></button>}
      </div>

      <section aria-labelledby="markets-results" className={styles.results}>
        <h2 id="markets-results" className="sr-only">{FILTER_LABELS[view.filter]} markets</h2>
        {page.items.length ? <table className={styles.table}>
          <caption className="sr-only">{`${filtered.length} assets, ${SORT_LABELS[view.sort]}. Prices are a dated snapshot, not quotes.`}</caption>
          <thead><tr><th scope="col">Asset</th><th scope="col">Price</th><th scope="col">24h</th><th scope="col" className={styles.wide}>Volume 24h</th><th scope="col" className={styles.wide}>Liquidity</th><th scope="col"><span className="sr-only">Add to plan</span></th></tr></thead>
          <tbody>{page.items.map(row => { const added = inPlan.has(row.mint); return <tr key={row.mint}>
            <th scope="row"><button type="button" className={styles.assetButton} onClick={() => change({ asset: row.mint, page: page.page })} aria-label={`${row.symbol}, ${row.name}. Open details`}>
              <span className={styles.logo} aria-hidden="true"><Image src={row.logoUrl} alt="" width={34} height={34} unoptimized /></span>
              <span className={styles.assetText}><strong>{row.symbol}</strong><span>{row.name}</span></span>
              {row.category !== 'stocks' && <span className={styles.tag}>{row.category === 'etfs' ? 'ETF' : 'Pre-IPO'}</span>}
            </button></th>
            <td className={styles.number}>{formatMarketPrice(row.stats?.price)}</td>
            <td><ChangeBadge value={row.stats?.change24hPct ?? null} /></td>
            <td className={`${styles.number} ${styles.wide}`}>{formatMarketUsd(row.stats?.volume24hUsd)}</td>
            <td className={`${styles.number} ${styles.wide}`}>{formatMarketUsd(row.stats?.liquidityUsd)}</td>
            <td className={styles.addCell}><button type="button" className={styles.addButton} data-added={added} disabled={added} onClick={() => add(row.mint)} aria-label={added ? `${row.symbol} is in your plan` : `Add ${row.symbol} to your plan`}>{added ? <Check size={16} /> : <Plus size={16} />}</button></td>
          </tr>; })}</tbody>
        </table> : <div className={styles.empty}><h3>No assets match.</h3><p>Try another company name, ticker or mint, or show all asset types.</p><button type="button" className="button secondary" onClick={() => change({ query: '', filter: 'all' })}>Show everything</button></div>}
        {filtered.length > MARKETS_PAGE_SIZE && <nav className={styles.pager} aria-label="Pages">
          <button type="button" disabled={page.page <= 1} onClick={() => change({ page: page.page - 1 })} aria-label="Previous page"><ChevronLeft size={16} /></button>
          <span>{page.start}–{page.end} of {filtered.length}</span>
          <button type="button" disabled={page.page >= page.pages} onClick={() => change({ page: page.page + 1 })} aria-label="Next page"><ChevronRight size={16} /></button>
        </nav>}
      </section>

      <p className={styles.footnote}>Market figures come from Jupiter’s token data and are rounded for display. They help you choose; they are never a quote, and they never set an allocation. Asset types use each underlying’s ETF flag in Nasdaq’s public symbol directory. <Link href="/how-it-works">How Lotline plans</Link></p>
    </main>
    <SiteFooter />
    <AssetSheet row={selected} snapshotTime={snapshot?.fetchedAt ?? null} inPlan={selected ? inPlan.has(selected.mint) : false} onAdd={add} onClose={() => change({ asset: null, page: page.page })} />
    <div className={`toast${notice ? ' visible' : ''}${notice?.error ? ' toast-error' : ''}`} role="status" aria-live="polite" aria-atomic="true">{notice && <><span>{notice.text}</span>{notice.href && <Link className={styles.toastLink} href={notice.href}>Open plan</Link>}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></>}</div>
  </>;
}
