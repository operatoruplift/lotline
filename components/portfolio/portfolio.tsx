'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Building2, CalendarClock, Check, Clipboard, Coins, Gem, Landmark, Layers, Rocket, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { readDevicePlans, sameSplit, type DevicePlans } from '@/lib/client/device-plans';
import type { SavedReminder } from '@/lib/client/reminder';
import { displayAmount } from '@/lib/domain/format';
import { categoryCounts, formatMarketPrice, marketIdentities, marketIdentity, marketTypeLabel, type MarketFilter, type MarketSnapshot } from '@/lib/domain/markets';
import { formatUsdc } from '@/lib/domain/math';
import { PLANNER_UNIVERSES, type PlannerUniverse } from '@/lib/domain/planner-universe';
import { formatBps, summarizePlan } from '@/lib/domain/portfolio';
import { buildPlanLink } from '@/lib/domain/share';
import type { Basket } from '@/lib/domain/types';
import { fetchMarketSnapshot } from '@/lib/client/market-snapshot';
import { ChangeBadge } from '../markets/asset-sheet';
import { Following } from './following';
import { SiteFooter, SiteHeader } from '../site-shell';
import { utcTime } from '../verification-receipt';
import styles from './portfolio.module.css';

/** The planner's split-bar colours, in the same order. */
const PALETTE = ['var(--forest)', 'var(--sage)', 'var(--mint)', '#437365', '#82946B'];
const TILES: { filter: MarketFilter; label: string; Icon: LucideIcon }[] = [
  { filter: 'stocks', label: 'Stocks', Icon: Building2 },
  { filter: 'etfs', label: 'ETFs', Icon: Layers },
  { filter: 'metals', label: 'Metals', Icon: Gem },
  { filter: 'bonds', label: 'Bonds', Icon: Landmark },
  { filter: 'pre-ipo', label: 'Pre-IPO', Icon: Rocket },
];
const CRYPTO_TILE = { filter: 'crypto' as const, label: 'Crypto', Icon: Coins };

function reviewTime(reminder: SavedReminder): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: reminder.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(reminder.nextDueAt));
  } catch { return new Date(reminder.nextDueAt).toUTCString(); }
}

function reminderUniverse(reminder: SavedReminder): PlannerUniverse | null {
  const identity = reminder.basket.items[0] ? marketIdentity(reminder.basket.items[0].mint) : undefined;
  return identity?.universe ?? null;
}

function PlanCard({ universe, basket, reminder, snapshot }: { universe: PlannerUniverse; basket: Basket; reminder: SavedReminder | null; snapshot: MarketSnapshot | null }) {
  const summary = useMemo(() => summarizePlan(basket), [basket]);
  const [copied, setCopied] = useState(false);
  const planPath = PLANNER_UNIVERSES[universe].path;
  const id = `plan-${universe}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(buildPlanLink(window.location.origin, basket, 'live', universe)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }
  return (
    <section className={styles.card} aria-labelledby={`${id}-title`} data-universe={universe}>
      <header className={styles.cardHead}>
        <div>
          <p className={styles.cardEyebrow}>{universe === 'prestocks' ? 'Your PreStocks plan' : 'Your plan'}</p>
          <h2 id={`${id}-title`}>{summary.budgetText ? <>{displayAmount(summary.budgetText)} <span>USDC</span></> : 'No budget yet'}</h2>
          <p>{summary.valid ? `per contribution, split across ${summary.lines.length} ${summary.lines.length === 1 ? 'asset' : 'assets'}` : summary.message}</p>
        </div>
        <span className={styles.status} data-state={summary.valid ? 'ready' : 'draft'}>{summary.valid ? <><Check size={13} aria-hidden="true" />Ready</> : `${formatBps(summary.assignedBps)} assigned`}</span>
      </header>

      <div className={styles.bar} aria-hidden="true">
        {summary.lines.map((line, index) => <span key={line.mint} style={{ width: `${Math.min(100, (line.weightBps ?? 0) / 100)}%`, background: PALETTE[index % PALETTE.length] }} />)}
      </div>
      {summary.mix.length > 0 && <ul className={styles.mix} aria-label="Split by asset type">
        {summary.mix.map(item => <li key={item.key}>{item.label} <strong>{formatBps(item.bps)}</strong></li>)}
      </ul>}

      <ul className={styles.lines}>
        {summary.lines.map((line, index) => {
          const stats = snapshot?.stats[line.mint];
          return <li key={line.mint}>
            <span className={styles.swatch} style={{ background: PALETTE[index % PALETTE.length] }} aria-hidden="true" />
            <span className={styles.logo} aria-hidden="true">{line.identity && <Image src={line.identity.logoUrl} alt="" width={32} height={32} unoptimized />}</span>
            <span className={styles.lineText}>
              <strong>{line.identity?.symbol ?? `${line.mint.slice(0, 4)}…${line.mint.slice(-4)}`}</strong>
              <small>{line.identity ? `${line.identity.name} · ${marketTypeLabel(line.identity)}` : 'Not in the verified catalog'}</small>
            </span>
            <span className={styles.lineWeight}>
              <strong>{line.weightBps === null ? '—' : formatBps(line.weightBps)}</strong>
              <small>{line.usdcRaw ? `${displayAmount(formatUsdc(line.usdcRaw))} USDC` : ' '}</small>
            </span>
            <span className={styles.lineMarket}>
              <span>{formatMarketPrice(stats?.price)}</span>
              <ChangeBadge value={stats?.change24hPct ?? null} />
            </span>
          </li>;
        })}
      </ul>
      <p className={styles.note}>{snapshot ? `Prices are Jupiter’s market snapshot at ${utcTime(snapshot.fetchedAt)}, not quotes.` : 'Prices appear when the market snapshot loads; they are never quotes.'} The planner asks for fresh estimates for your exact amounts.</p>

      <div className={styles.next}>
        <CalendarClock size={16} aria-hidden="true" />
        {reminder ? <p>Next review <strong>{reviewTime(reminder)}</strong> ({reminder.timezone}), {reminder.cadence}{reminder.paused ? ', paused' : ''}.{!sameSplit(reminder.basket, basket) && ' It keeps the split it was saved with; update it in the planner.'}</p>
          : <p>No review reminder yet. <Link href={planPath}>Set one in the planner</Link>: Lotline reminds you, you decide, and nothing buys on its own.</p>}
      </div>

      <div className={styles.actions}>
        <Link className="button primary" href={planPath}>{summary.valid ? 'Review and get estimates' : 'Finish your split'} <ArrowRight size={15} aria-hidden="true" /></Link>
        <Link className="button secondary" href={universe === 'prestocks' ? '/markets?category=pre-ipo' : '/markets'}>Add assets</Link>
        {summary.valid && <button type="button" className={styles.textButton} onClick={copyLink}>{copied ? <><Check size={14} aria-hidden="true" />Link copied</> : <><Clipboard size={14} aria-hidden="true" />Copy plan link</>}</button>}
      </div>
    </section>
  );
}

function Welcome({ gallery, crypto }: { gallery: boolean; crypto: boolean }) {
  const tiles = crypto ? [...TILES, CRYPTO_TILE] : TILES;
  const counts = categoryCounts(marketIdentities(crypto));
  return (
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <h2 id="welcome-title" className="sr-only">Start a plan</h2>
      <div className={styles.welcomeActions}>
        <Link className="button primary" href="/app">Start your plan <ArrowRight size={15} aria-hidden="true" /></Link>
        <Link className="button secondary" href="/markets">Explore markets</Link>
        <Link className={styles.textLink} href="/app?mode=example">Try the Example</Link>
      </div>
      <ul className={styles.tiles} aria-label="Browse markets by type" data-count={tiles.length}>
        {tiles.map(({ filter, label, Icon }) => <li key={filter}><Link href={`/markets?category=${filter}`}><Icon size={22} aria-hidden="true" /><strong>{label}</strong><small>{counts[filter]}<span> verified</span></small></Link></li>)}
      </ul>
      <ol className={styles.steps} aria-label="How it works">
        <li><span aria-hidden="true">1</span><div><strong>Pick up to ten assets and set your split</strong><p>Stocks, ETFs, metals, bonds and pre-IPO names, each with a verified Solana mint.</p></div></li>
        <li><span aria-hidden="true">2</span><div><strong>Get estimates for your exact amount</strong><p>Your USDC is split to the micro-unit, and each estimate is a fresh quote that expires.</p></div></li>
        <li><span aria-hidden="true">3</span><div><strong>Review every purchase yourself</strong><p>Lotline never buys or signs on its own. Set a reminder and decide each time it comes round.</p></div></li>
      </ol>
      {gallery && <Link className={styles.community} href="/plans"><Users size={20} aria-hidden="true" /><span><strong>Start from a community plan</strong><small>Splits members shared, ranked by copies, never by returns.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>}
    </section>
  );
}

/** The phone-first home: this device's plans at a glance, or a start when there are none. */
export function Portfolio({ gallery, crypto = false }: { gallery: boolean; crypto?: boolean }) {
  const [plans, setPlans] = useState<DevicePlans | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const read = useCallback(() => {
    try { setPlans(readDevicePlans(window.localStorage)); }
    catch { setPlans({ drafts: { xstocks: null, prestocks: null }, reminder: null }); }
  }, []);

  useEffect(() => {
    queueMicrotask(read);
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith('lotline:')) read(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [read]);

  const hasPlan = !!plans && (!!plans.drafts.xstocks || !!plans.drafts.prestocks);
  useEffect(() => {
    if (!hasPlan) return;
    const controller = new AbortController();
    fetchMarketSnapshot(controller.signal).then(result => { if (!controller.signal.aborted && result.state === 'ready') setSnapshot(result.snapshot); });
    return () => controller.abort();
  }, [hasPlan]);

  const reminderFor = (universe: PlannerUniverse) => plans?.reminder && reminderUniverse(plans.reminder) === universe ? plans.reminder : null;
  return <>
    <SiteHeader active="portfolio" markets community={gallery} />
    <main id="main" className={`page-width ${styles.page}`}>
      <div className={styles.heading}>
        <p className="eyebrow">PORTFOLIO · ON THIS DEVICE</p>
        <h1>{hasPlan ? 'Your plan at a glance.' : 'Start with one clear split.'}</h1>
        <p>{hasPlan ? 'Your split, what it holds by type and how each asset moved today. Estimates and purchases stay in the planner, where you review every one.' : 'Build one contribution plan across stocks, ETFs, metals, bonds and pre-IPO names, with your own split and every mint verified.'}</p>
      </div>
      {plans === null ? <p className={styles.loading} role="status">Reading the plan saved on this device…</p>
        : hasPlan ? <div className={styles.cards}>
          {plans.drafts.xstocks && <PlanCard universe="xstocks" basket={plans.drafts.xstocks} reminder={reminderFor('xstocks')} snapshot={snapshot} />}
          {plans.drafts.prestocks && <PlanCard universe="prestocks" basket={plans.drafts.prestocks} reminder={reminderFor('prestocks')} snapshot={snapshot} />}
          {gallery && <Link className={styles.community} href="/plans"><Users size={20} aria-hidden="true" /><span><strong>Compare with community plans</strong><small>Splits members shared, ranked by copies, never by returns.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
          : <Welcome gallery={gallery} crypto={crypto} />}
      {gallery && <Following />}
      <p className={styles.privacy}><ShieldCheck size={14} aria-hidden="true" />Read from this browser only. Lotline sees your plan only if you save it to an account or share its link.</p>
    </main>
    <SiteFooter />
  </>;
}
