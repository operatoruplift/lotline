/**
 * Toward a target mix, without selling.
 *
 * A plan's percentages can also be read as the mix someone wants to hold. Given
 * current holdings valued at a dated market snapshot, this divides one new
 * contribution among the assets that sit below their target share, in
 * proportion to how far below they are. Nothing is sold, and assets at or above
 * target receive nothing. The result is a split in basis points that sums to
 * exactly 10,000, so the planner's exact allocation arithmetic stays in charge
 * of the USDC amounts; the valuations here are estimates only.
 */
export interface TargetInput { mint: string; bps: number }
export interface HoldingValue { mint: string; usd: number }
export interface TowardTargetRow {
  mint: string;
  targetBps: number;
  /** Current share of the valued holdings, in basis points (rounded for display). */
  nowBps: number;
  /** Suggested share of this contribution, in basis points. */
  contributionBps: number;
  /** Estimated share after the contribution, in basis points (rounded for display). */
  afterBps: number;
  valueUsd: number;
}
export type TowardTarget =
  | { state: 'ready'; rows: TowardTargetRow[]; holdingsUsd: number; contributionUsd: number; changed: boolean }
  | { state: 'unavailable'; reason: 'no-contribution' | 'invalid-targets' | 'missing-values' | 'nothing-held' };

const round = (value: number) => Math.round(value);

/** Largest-remainder rounding to whole basis points that sum to exactly 10,000. */
export function toBasisPoints(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return weights.map(() => 0);
  const exact = weights.map(value => (value / total) * 10_000);
  const floors = exact.map(Math.floor);
  let remainder = 10_000 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - floors[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    if (weights[index] <= 0) continue;
    result[index] += 1;
    remainder -= 1;
  }
  return result;
}

export function towardTarget(targets: readonly TargetInput[], values: readonly HoldingValue[], contributionUsd: number): TowardTarget {
  if (!(contributionUsd > 0) || !Number.isFinite(contributionUsd)) return { state: 'unavailable', reason: 'no-contribution' };
  if (!targets.length || targets.some(target => !Number.isInteger(target.bps) || target.bps < 0) || targets.reduce((sum, target) => sum + target.bps, 0) !== 10_000 ||
      new Set(targets.map(target => target.mint)).size !== targets.length) return { state: 'unavailable', reason: 'invalid-targets' };
  const valueOf = new Map(values.map(value => [value.mint, value.usd]));
  if (targets.some(target => { const usd = valueOf.get(target.mint); return usd === undefined || !Number.isFinite(usd) || usd < 0; })) return { state: 'unavailable', reason: 'missing-values' };
  const current = targets.map(target => valueOf.get(target.mint)!);
  const holdingsUsd = current.reduce((sum, value) => sum + value, 0);
  if (!(holdingsUsd > 0)) return { state: 'unavailable', reason: 'nothing-held' };
  const total = holdingsUsd + contributionUsd;
  const deficits = targets.map((target, index) => Math.max(0, (target.bps / 10_000) * total - current[index]));
  const contributionBps = toBasisPoints(deficits);
  const rows = targets.map((target, index): TowardTargetRow => {
    const added = (contributionBps[index] / 10_000) * contributionUsd;
    return {
      mint: target.mint, targetBps: target.bps, valueUsd: current[index],
      nowBps: round((current[index] / holdingsUsd) * 10_000),
      contributionBps: contributionBps[index],
      afterBps: round(((current[index] + added) / total) * 10_000),
    };
  });
  return { state: 'ready', rows, holdingsUsd, contributionUsd, changed: rows.some(row => row.contributionBps !== row.targetBps) };
}

/** Basis points as the planner's percentage text: up to two decimals, trailing zeros removed. */
export function bpsToPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  return fraction ? `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}` : String(whole);
}
