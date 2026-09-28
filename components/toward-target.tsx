'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, LoaderCircle, RotateCcw, Scale } from 'lucide-react';
import type { MarketSnapshot } from '@/lib/domain/markets';
import { parsePercent } from '@/lib/domain/math';
import { bpsToPercent, towardTarget, type TargetInput } from '@/lib/domain/rebalance';
import type { Asset, Basket, HoldingsResponse } from '@/lib/domain/types';
import type { PlannerUniverse } from '@/lib/domain/planner-universe';
import { utcTime } from './verification-receipt';
import styles from './toward-target.module.css';

type Props = { basket: Basket; holdings: HoldingsResponse; assets: readonly Asset[]; universe: PlannerUniverse; onApply: (next: Basket, message: string) => void };
type Prices = { state: 'loading' } | { state: 'ready'; snapshot: MarketSnapshot } | { state: 'failed' };

const targetKey = (universe: PlannerUniverse) => `lotline:target-split:v1:${universe}`;
const sameMints = (a: readonly { mint: string }[], b: readonly { mint: string }[]) => a.length === b.length && a.every(item => b.some(other => other.mint === item.mint));
const pct = (bps: number) => `${bpsToPercent(bps)}%`;

function readTargets(basket: Basket, universe: PlannerUniverse): { targets: TargetInput[]; saved: boolean } | null {
  const fromBasket = (): TargetInput[] | null => {
    try { return basket.items.map(item => ({ mint: item.mint, bps: parsePercent(item.percent) })); } catch { return null; }
  };
  try {
    const raw = window.localStorage.getItem(targetKey(universe));
    const saved = raw ? JSON.parse(raw) as { items?: unknown } : null;
    const items = Array.isArray(saved?.items) ? (saved.items as { mint?: unknown; bps?: unknown }[]).filter(item => typeof item.mint === 'string' && Number.isInteger(item.bps)).map(item => ({ mint: item.mint as string, bps: item.bps as number })) : [];
    if (items.length && sameMints(items, basket.items) && items.reduce((sum, item) => sum + item.bps, 0) === 10_000) return { targets: basket.items.map(item => items.find(saved => saved.mint === item.mint)!), saved: true };
  } catch { /* Storage can be blocked; the split on screen is the target. */ }
  const targets = fromBasket();
  return targets ? { targets, saved: false } : null;
}

/**
 * Reads the plan's split as a target mix and suggests how to divide this
 * contribution toward it, valuing current holdings at the dated market snapshot.
 */
export function TowardTarget({ basket, holdings, assets, universe, onApply }: Props) {
  const [prices, setPrices] = useState<Prices>({ state: 'loading' });
  // Bumped after apply or restore so the saved target split is read again.
  const [, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/markets', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) })
      .then(async response => { const body = await response.json() as MarketSnapshot; if (!controller.signal.aborted) setPrices(response.ok && body && typeof body.stats === 'object' ? { state: 'ready', snapshot: body } : { state: 'failed' }); })
      .catch(() => { if (!controller.signal.aborted) setPrices({ state: 'failed' }); });
    return () => controller.abort();
  }, []);

  const read = typeof window === 'undefined' ? null : readTargets(basket, universe);
  const contributionUsd = Number(basket.budget);
  const symbol = (mint: string) => assets.find(asset => asset.mint === mint)?.symbol ?? 'Asset';
  const values = useMemo(() => {
    if (prices.state !== 'ready') return null;
    return basket.items.map(item => {
      const holding = holdings.holdings.find(entry => entry.mint === item.mint);
      const price = prices.snapshot.stats[item.mint]?.price;
      const units = holding?.state === 'success' && holding.units !== null ? Number(holding.units) : NaN;
      return { mint: item.mint, usd: Number.isFinite(units) && typeof price === 'number' ? units * price : NaN };
    });
  }, [basket.items, holdings, prices]);
  const result = read && values ? towardTarget(read.targets, values.filter(value => Number.isFinite(value.usd)), contributionUsd) : null;
  const unpriced = values ? values.filter(value => !Number.isFinite(value.usd)).map(value => symbol(value.mint)) : [];
  const appliedAlready = read?.saved && result?.state === 'ready' && result.rows.every(row => { try { return parsePercent(basket.items.find(item => item.mint === row.mint)!.percent) === row.contributionBps; } catch { return false; } });

  function apply() {
    if (!read || result?.state !== 'ready') return;
    try { if (!read.saved) window.localStorage.setItem(targetKey(universe), JSON.stringify({ version: 1, items: read.targets })); } catch { /* The suggestion still applies; restoring then needs a manual edit. */ }
    onApply({ ...basket, items: basket.items.map(item => ({ ...item, percent: bpsToPercent(result.rows.find(row => row.mint === item.mint)!.contributionBps) })) }, 'Suggested split applied to this contribution. Your target split is kept; restore it at any time.');
    setRevision(value => value + 1);
  }
  function restore() {
    if (!read?.saved) return;
    try { window.localStorage.removeItem(targetKey(universe)); } catch { /* Nothing stored to remove. */ }
    onApply({ ...basket, items: basket.items.map(item => ({ ...item, percent: bpsToPercent(read.targets.find(target => target.mint === item.mint)!.bps) })) }, 'Target split restored.');
    setRevision(value => value + 1);
  }

  return <section className={styles.panel} aria-labelledby="toward-target-title">
    <div className={styles.heading}>
      <Scale size={18} aria-hidden="true" />
      <div>
        <h3 id="toward-target-title">Balance toward your split</h3>
        <p>Read your split as the mix you want to hold. This contribution can go to the assets below their share, without selling anything.</p>
      </div>
    </div>
    {prices.state === 'loading' && <p className={styles.state}><LoaderCircle size={14} className="spinning" aria-hidden="true" />Valuing your balances at the market snapshot…</p>}
    {prices.state === 'failed' && <p className={styles.state}>Market prices are unavailable right now, so current holdings can’t be valued. Your split still describes this contribution.</p>}
    {prices.state === 'ready' && unpriced.length > 0 && <p className={styles.state}>No snapshot price for {unpriced.join(', ')}, so the mix can’t be compared. Your split still describes this contribution.</p>}
    {result?.state === 'unavailable' && unpriced.length === 0 && <p className={styles.state}>{result.reason === 'nothing-held' ? 'Your wallet holds none of these assets yet, so your split already describes this contribution.' : result.reason === 'no-contribution' ? 'Enter a contribution amount to see a suggestion.' : 'Complete your split to 100% to compare it with your holdings.'}</p>}
    {result?.state === 'ready' && <>
      <table className={styles.table}>
        <caption className="sr-only">Target share, current share, suggested share of this contribution and estimated share after it, per asset</caption>
        <thead><tr><th scope="col">Asset</th><th scope="col">{read?.saved ? 'Target' : 'Your split'}</th><th scope="col">Now</th><th scope="col">This contribution</th><th scope="col">After</th></tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.mint}>
          <th scope="row">{symbol(row.mint)}</th>
          <td>{pct(row.targetBps)}</td>
          <td data-direction={row.nowBps < row.targetBps ? 'under' : row.nowBps > row.targetBps ? 'over' : 'even'}>{pct(row.nowBps)}</td>
          <td><strong>{pct(row.contributionBps)}</strong></td>
          <td>{pct(row.afterBps)}</td>
        </tr>)}</tbody>
      </table>
      <p className={styles.note}>Holdings valued at {prices.state === 'ready' ? `Jupiter’s market snapshot from ${utcTime(prices.snapshot.fetchedAt)}` : 'the market snapshot'}: about ${Math.round(result.holdingsUsd).toLocaleString('en-US')} held plus this {contributionUsd.toLocaleString('en-US')} USDC. Shares are estimates; the planner still computes exact USDC amounts and fresh quotes from whichever split you use.</p>
      <div className={styles.actions}>
        {!result.changed ? <p className={styles.even}>Your holdings already match your split, so this contribution follows it.</p>
          : appliedAlready ? <p className={styles.even}>This contribution uses the suggested split.</p>
            : <button type="button" className="button secondary" onClick={apply}>Use this split for this contribution <ArrowRight size={14} /></button>}
        {read?.saved && <button type="button" className={styles.restore} onClick={restore}><RotateCcw size={13} />Restore target split ({read.targets.map(target => pct(target.bps)).join(' / ')})</button>}
      </div>
    </>}
  </section>;
}
