import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followOnDevice, readFollowing, unfollowOnDevice } from '../lib/client/following';
import { finishFollowReview, prepareFollowReview } from '../lib/client/following-review';
import { galleryPlanToBasket } from '../lib/domain/gallery';
import { encodePlanHash } from '../lib/domain/share';

const first = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const second = 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX';
const original = { id: '00000000-0000-4000-8000-000000000001', name: 'Shared split', display_name: 'Alice', allocations: [{ mint: first, bps: '10000' }] };
const updated = { ...original, allocations: [{ mint: first, bps: '6000' }, { mint: second, bps: '4000' }], copy_count: 12, published_at: '2026-09-29T00:00:00Z' };
const hash = encodePlanHash(galleryPlanToBasket(updated), 'live');
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
const accepted = () => readFollowing(window.localStorage)[0]?.allocations;

beforeEach(() => vi.stubGlobal('window', { localStorage: memory(), sessionStorage: memory(), dispatchEvent: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('following a reviewed community split', () => {
  it('keeps the accepted split when its review is opened and then cancelled', () => {
    followOnDevice(original);
    prepareFollowReview(updated, hash);
    expect(accepted()).toEqual(original.allocations);
    finishFollowReview(hash, false);
    finishFollowReview(hash, true);
    expect(accepted()).toEqual(original.allocations);
  });

  it('acknowledges only the applied review, keeping full gallery records supported', () => {
    followOnDevice(original);
    prepareFollowReview(updated, hash);
    finishFollowReview(encodePlanHash(galleryPlanToBasket(updated, '75'), 'live'), true);
    expect(accepted()).toEqual(original.allocations);
    finishFollowReview(hash, true);
    expect(accepted()).toEqual(updated.allocations);
  });

  it('still follows an initial copy but never restores a follow removed during review', () => {
    prepareFollowReview(original, encodePlanHash(galleryPlanToBasket(original), 'live'));
    expect(accepted()).toEqual(original.allocations);
    prepareFollowReview(updated, hash);
    unfollowOnDevice(original.id);
    finishFollowReview(hash, true);
    expect(readFollowing(window.localStorage)).toEqual([]);
  });

  it('keeps accepted state if tab storage is blocked', () => {
    followOnDevice(original);
    vi.stubGlobal('window', { ...window, sessionStorage: { setItem: () => { throw new Error('blocked'); }, getItem: () => { throw new Error('blocked'); } } });
    expect(() => prepareFollowReview(updated, hash)).not.toThrow();
    expect(() => finishFollowReview(hash, true)).not.toThrow();
    expect(accepted()).toEqual(original.allocations);
  });
});
