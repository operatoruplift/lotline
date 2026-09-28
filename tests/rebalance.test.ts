import { describe, expect, it } from 'vitest';
import { bpsToPercent, toBasisPoints, towardTarget } from '../lib/domain/rebalance';

const [A, B, C] = ['XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh'];
const split = [{ mint: A, bps: 5_000 }, { mint: B, bps: 3_000 }, { mint: C, bps: 2_000 }];
const held = (a: number, b: number, c: number) => [{ mint: A, usd: a }, { mint: B, usd: b }, { mint: C, usd: c }];
const shares = (result: ReturnType<typeof towardTarget>) => result.state === 'ready' ? result.rows.map(row => [row.contributionBps, row.afterBps]) : result.reason;

describe('rounding to basis points', () => {
  it('always sums to 10,000 and never gives a share to a zero weight', () => {
    expect(toBasisPoints([1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(toBasisPoints([0, 2, 1])).toEqual([0, 6667, 3333]);
    expect(toBasisPoints([0, 0, 5])).toEqual([0, 0, 10_000]);
    expect(toBasisPoints([0, 0])).toEqual([0, 0]);
    for (const weights of [[0.1, 0.2, 0.7], [7, 11, 13, 17], [1e-9, 1, 1e9]]) expect(toBasisPoints(weights).reduce((sum, value) => sum + value, 0)).toBe(10_000);
  });
  it('prints basis points the way the planner accepts percentages', () => {
    expect([bpsToPercent(5000), bpsToPercent(3334), bpsToPercent(2550), bpsToPercent(1), bpsToPercent(0)]).toEqual(['50', '33.34', '25.5', '0.01', '0']);
  });
});

describe('dividing a contribution toward a target mix', () => {
  it('fills each underweight asset in proportion to its shortfall and lands on target when that is possible', () => {
    // 1,000 held, 1,000 new: targets become 1,000 / 600 / 400.
    expect(shares(towardTarget(split, held(600, 300, 100), 1_000))).toEqual([[4000, 5000], [3000, 3000], [3000, 2000]]);
  });
  it('sells nothing: an overweight asset gets 0% and the rest shares the contribution', () => {
    const result = towardTarget(split, held(1_500, 0, 0), 500);
    expect(shares(result)).toEqual([[0, 7500], [6000, 1500], [4000, 1000]]);
    expect(result.state === 'ready' && result.changed).toBe(true);
  });
  it('follows the split unchanged when holdings already match it', () => {
    const result = towardTarget(split, held(500, 300, 200), 1_000);
    expect(shares(result)).toEqual([[5000, 5000], [3000, 3000], [2000, 2000]]);
    expect(result.state === 'ready' && result.changed).toBe(false);
  });
  it('reports current shares from the valued holdings', () => {
    const result = towardTarget(split, held(750, 250, 0), 250);
    expect(result.state === 'ready' && result.rows.map(row => row.nowBps)).toEqual([7500, 2500, 0]);
    expect(result.state === 'ready' && result.holdingsUsd).toBe(1_000);
  });
  it('declines to suggest without a contribution, a complete split, every value, or anything held', () => {
    expect(towardTarget(split, held(1, 1, 1), 0)).toEqual({ state: 'unavailable', reason: 'no-contribution' });
    expect(towardTarget(split, held(1, 1, 1), Number.NaN)).toEqual({ state: 'unavailable', reason: 'no-contribution' });
    expect(towardTarget([{ mint: A, bps: 5_000 }, { mint: B, bps: 4_000 }], held(1, 1, 1), 100)).toEqual({ state: 'unavailable', reason: 'invalid-targets' });
    expect(towardTarget([{ mint: A, bps: 5_000 }, { mint: A, bps: 5_000 }], held(1, 1, 1), 100)).toEqual({ state: 'unavailable', reason: 'invalid-targets' });
    expect(towardTarget(split, held(1, 1, 1).slice(0, 2), 100)).toEqual({ state: 'unavailable', reason: 'missing-values' });
    expect(towardTarget(split, held(1, Number.POSITIVE_INFINITY, 1), 100)).toEqual({ state: 'unavailable', reason: 'missing-values' });
    expect(towardTarget(split, held(0, 0, 0), 100)).toEqual({ state: 'unavailable', reason: 'nothing-held' });
  });
});
