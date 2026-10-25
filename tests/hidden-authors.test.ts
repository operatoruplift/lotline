import { describe, expect, it } from 'vitest';
import { MAX_HIDDEN_AUTHORS, visiblePlans, withHiddenAuthor, withoutHiddenAuthor, type HiddenAuthor } from '../lib/domain/hidden-authors';
import { HIDDEN_AUTHORS_STORAGE_KEY, readHiddenAuthors, writeHiddenAuthors } from '../lib/client/hidden-authors';
import { galleryPlanSchema, type GalleryPlan } from '../lib/domain/gallery';

const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const key = (digit: string) => digit.repeat(24);
const plan = (id: string, author_key?: string, display_name: string | null = 'Alice'): GalleryPlan => ({
  id, name: `Plan ${id.slice(0, 4)}`, display_name, copy_count: 0, published_at: '2026-10-01T12:00:00.000Z',
  allocations: [{ mint: AAPLX, bps: '10000' }], ...(author_key ? { author_key } : {}),
});
const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); }, values };
};

describe('hiding an author’s plans on this device', () => {
  it('keeps one entry per author, newest first, with the name shown when hidden', () => {
    const now = new Date('2026-10-07T09:00:00.000Z');
    let list: HiddenAuthor[] = withHiddenAuthor([], { author_key: key('a'), display_name: 'Alice' }, now);
    list = withHiddenAuthor(list, { author_key: key('b'), display_name: null }, now);
    list = withHiddenAuthor(list, { author_key: key('a'), display_name: 'Alice R' }, new Date('2026-10-08T09:00:00.000Z'));
    expect(list).toEqual([
      { key: key('a'), name: 'Alice R', since: '2026-10-07T09:00:00.000Z' },
      { key: key('b'), name: null, since: '2026-10-07T09:00:00.000Z' },
    ]);
    expect(withoutHiddenAuthor(list, key('a'))).toEqual([list[1]]);
    const full = Array.from({ length: MAX_HIDDEN_AUTHORS + 5 }, (_, index) => index.toString(16).padStart(24, '0'))
      .reduce<HiddenAuthor[]>((current, author) => withHiddenAuthor(current, { author_key: author, display_name: null }, now), []);
    expect(full).toHaveLength(MAX_HIDDEN_AUTHORS);
  });

  it('filters only plans whose author is hidden, and keeps plans without a key', () => {
    const plans = [plan('11111111-1111-4111-8111-111111111111', key('a')), plan('22222222-2222-4222-8222-222222222222', key('b')), plan('33333333-3333-4333-8333-333333333333')];
    const hidden = [{ key: key('a'), name: 'Alice', since: '2026-10-07T09:00:00.000Z' }];
    expect(visiblePlans(plans, hidden).map(item => item.id)).toEqual([plans[1].id, plans[2].id]);
    expect(visiblePlans(plans, [])).toEqual(plans);
  });

  it('reads corrupt or blocked storage as nothing hidden, and writes what it reads', () => {
    expect(readHiddenAuthors(memory())).toEqual([]);
    expect(readHiddenAuthors(memory({ [HIDDEN_AUTHORS_STORAGE_KEY]: '{not json' }))).toEqual([]);
    expect(readHiddenAuthors(memory({ [HIDDEN_AUTHORS_STORAGE_KEY]: JSON.stringify([{ key: 'not-a-key', name: null, since: 'x' }]) }))).toEqual([]);
    expect(readHiddenAuthors({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
    const storage = memory();
    const list = [{ key: key('c'), name: 'Chen', since: '2026-10-07T09:00:00.000Z' }];
    expect(writeHiddenAuthors(storage, list)).toBe(true);
    expect(readHiddenAuthors(storage)).toEqual(list);
    expect(writeHiddenAuthors({ setItem: () => { throw new Error('full'); } }, list)).toBe(false);
  });

  it('accepts a well-formed author key from the gallery, and nothing else in its place', () => {
    expect(galleryPlanSchema.parse(plan('44444444-4444-4444-8444-444444444444', key('d'))).author_key).toBe(key('d'));
    expect(galleryPlanSchema.parse(plan('55555555-5555-4555-8555-555555555555')).author_key).toBeUndefined();
    for (const bad of ['D'.repeat(24), 'd'.repeat(23), 'd'.repeat(64), '00000000-0000-4000-8000-00000000000a']) {
      expect(galleryPlanSchema.safeParse(plan('66666666-6666-4666-8666-666666666666', bad)).success).toBe(false);
    }
  });
});
