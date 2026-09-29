import { describe, expect, it } from 'vitest';
import { FOLLOWING_STORAGE_KEY, readFollowing, writeFollowing } from '../lib/client/following';
import { MAX_FOLLOWED, splitChanges, withFollowed, withoutFollowed, type FollowedPlan } from '../lib/domain/following';

const [A, B, C, D] = ['XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB'];
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plan = (n: number, allocations: [string, string][], name = `Plan ${n}`) => ({ id: id(n), name, display_name: 'Alice', allocations: allocations.map(([mint, bps]) => ({ mint, bps })) });
const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
};

describe('split changes', () => {
  it('lists every weight that moved, the largest move first', () => {
    const before = [{ mint: A, bps: '5000' }, { mint: B, bps: '3000' }, { mint: C, bps: '2000' }];
    const after = [{ mint: A, bps: '5000' }, { mint: B, bps: '2500' }, { mint: D, bps: '2500' }];
    expect(splitChanges(before, after)).toEqual([
      { mint: D, before: 0, after: 2500 },
      { mint: C, before: 2000, after: 0 },
      { mint: B, before: 3000, after: 2500 },
    ]);
    expect(splitChanges(before, [...before].reverse())).toEqual([]);
    // Equal moves read in the author's order.
    expect(splitChanges(before, [{ mint: A, bps: '5000' }, { mint: C, bps: '2500' }, { mint: B, bps: '2500' }]).map(change => change.mint)).toEqual([C, B]);
  });
});

describe('following on this device', () => {
  it('follows most recent first, keeps the start date when accepting a new split, and never mutates', () => {
    const start = new Date('2026-09-29T08:00:00.000Z');
    const one = withFollowed([], plan(1, [[A, '10000']]), start);
    expect(one).toEqual([{ id: id(1), name: 'Plan 1', displayName: 'Alice', allocations: [{ mint: A, bps: '10000' }], since: start.toISOString() }]);
    const two = withFollowed(one, plan(2, [[B, '10000']]));
    expect(two.map(item => item.id)).toEqual([id(2), id(1)]);
    const accepted = withFollowed(two, plan(1, [[A, '6000'], [B, '4000']], 'Plan 1 v2'), new Date('2026-10-01T00:00:00.000Z'));
    expect(accepted[0]).toMatchObject({ id: id(1), name: 'Plan 1 v2', since: start.toISOString(), allocations: [{ mint: A, bps: '6000' }, { mint: B, bps: '4000' }] });
    expect(one).toHaveLength(1);
    expect(withoutFollowed(accepted, id(1)).map(item => item.id)).toEqual([id(2)]);
  });

  it('keeps at most twelve plans', () => {
    let list: FollowedPlan[] = [];
    for (let n = 1; n <= MAX_FOLLOWED + 3; n += 1) list = withFollowed(list, plan(n, [[A, '10000']]));
    expect(list).toHaveLength(MAX_FOLLOWED);
    expect(list[0].id).toBe(id(MAX_FOLLOWED + 3));
  });

  it('reads what it wrote, and treats corrupt, foreign or blocked storage as nothing followed', () => {
    const storage = memory();
    const list = withFollowed([], plan(1, [[A, '10000']]));
    expect(writeFollowing(storage, list)).toBe(true);
    expect(readFollowing(storage)).toEqual(list);
    expect(readFollowing(memory({ [FOLLOWING_STORAGE_KEY]: '{not json' }))).toEqual([]);
    expect(readFollowing(memory({ [FOLLOWING_STORAGE_KEY]: JSON.stringify([{ ...list[0], id: 'javascript:alert(1)' }]) }))).toEqual([]);
    expect(readFollowing({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
    expect(writeFollowing({ setItem: () => { throw new Error('quota'); } }, list)).toBe(false);
  });
});
