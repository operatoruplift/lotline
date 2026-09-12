import { describe, expect, it } from 'vitest';
import { DEFAULT_BASKET, EXAMPLE_ASSETS } from '../lib/demo/example';
import { buildPlanLink, decodePlanHash, encodePlanHash, MAX_PLAN_HASH_LENGTH } from '../lib/domain/share';
import { MAX_PLAN_ASSETS } from '../lib/domain/limits';

const payload = () => ({ v: 1, mode: 'example', budget: '10.000001', items: DEFAULT_BASKET.items.map(item => [item.mint, item.percent]) });
const hashFor = (value: unknown) => `#plan=${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;

describe('private, exact shareable plans', () => {
  it('round-trips exact decimal strings, asset order and each source mode', () => {
    const basket = { ...DEFAULT_BASKET, budget: '999999.999999', items: [...DEFAULT_BASKET.items].reverse().map((item, index) => ({ ...item, percent: ['33.33', '33.33', '33.34'][index] })) };
    for (const mode of ['live', 'example'] as const) {
      const hash = encodePlanHash(basket, mode);
      expect(hash.length).toBeLessThanOrEqual(MAX_PLAN_HASH_LENGTH);
      expect(decodePlanHash(hash)).toEqual({ basket, mode });
    }
  });

  it('copies only allowlisted fields, excluding private runtime data and metadata', () => {
    const basket = { ...DEFAULT_BASKET, wallet: 'private-wallet', account: 'private-account', quotes: ['private-estimate'], items: DEFAULT_BASKET.items.map(item => ({ ...item, name: 'private-name', wallet: 'another-wallet' })) };
    const decoded = Buffer.from(encodePlanHash(basket, 'live').slice(6), 'base64url').toString('utf8');
    expect(JSON.parse(decoded)).toEqual({ v: 1, mode: 'live', budget: DEFAULT_BASKET.budget, items: DEFAULT_BASKET.items.map(item => [item.mint, item.percent]) });
    expect(decoded).not.toMatch(/private|wallet|quotes|account|name/);
  });

  it('keeps plan data in the fragment and limits the path/query to the planner mode', () => {
    for (const mode of ['live', 'example'] as const) {
      const link = new URL(buildPlanLink('https://lotline.example', DEFAULT_BASKET, mode));
      expect(link.origin).toBe('https://lotline.example');
      expect(link.pathname).toBe('/app');
      expect(link.search).toBe(mode === 'example' ? '?mode=example' : '');
      expect(decodePlanHash(link.hash)).toEqual({ basket: DEFAULT_BASKET, mode });
    }
    expect(() => buildPlanLink('ftp://lotline.example', DEFAULT_BASKET, 'live')).toThrow();
  });

  it.each([
    { ...payload(), v: 2 },
    { ...payload(), mode: 'LIVE' },
    { ...payload(), budget: 10 },
    { ...payload(), budget: '1000000.000001' },
    { ...payload(), budget: '0' },
    { ...payload(), budget: '1e3' },
    { ...payload(), budget: '0.0000001' },
    { ...payload(), budget: '١٠' },
    { ...payload(), wallet: 'private' },
    { ...payload(), quotes: [] },
    { ...payload(), items: [] },
    { ...payload(), items: Array(4).fill([EXAMPLE_ASSETS[0].mint, '25']) },
    { ...payload(), items: [[EXAMPLE_ASSETS[0].mint, '50'], [EXAMPLE_ASSETS[0].mint, '50']] },
    { ...payload(), items: [[EXAMPLE_ASSETS[0].mint, '99.99']] },
    { ...payload(), items: [[EXAMPLE_ASSETS[0].mint, '100.001']] },
    { ...payload(), items: [[EXAMPLE_ASSETS[0].mint, 100]] },
    { ...payload(), items: [[EXAMPLE_ASSETS[0].mint, '100', 'private']] },
    { ...payload(), items: [{ mint: EXAMPLE_ASSETS[0].mint, percent: '100' }] },
    { ...payload(), items: [['javascript:alert(1)', '100']] },
    { ...payload(), items: [['0'.repeat(44), '100']] },
  ])('rejects invalid or unexpected payload fields: %j', value => {
    expect(decodePlanHash(hashFor(value))).toBeNull();
  });

  it('rejects malformed, overlong and noncanonical fragments without throwing', () => {
    for (const value of [null, {}, '', '#other=plan', '#plan=', '#plan=%', '#plan=e30=', '#plan=eyJ2Ijox', '#plan=____', '#plan=' + 'A'.repeat(MAX_PLAN_HASH_LENGTH), hashFor([payload()]), hashFor({})]) {
      expect(decodePlanHash(value)).toBeNull();
    }
    expect(() => encodePlanHash({ ...DEFAULT_BASKET, budget: '' }, 'live')).toThrow(/valid budget/);
  });

  it('does not mistake mint syntax for catalog verification', () => {
    const basket = { version: 1 as const, budget: '0.000001', items: [{ mint: '1'.repeat(32), percent: '100' }] };
    expect(decodePlanHash(encodePlanHash(basket, 'live'))).toEqual({ basket, mode: 'live' });
    expect(EXAMPLE_ASSETS.some(asset => asset.mint === basket.items[0].mint)).toBe(false);
  });
  it('round-trips ten long asset entries and rejects an eleventh unique asset', () => {
    const basket = { version: 1 as const, budget: '000000000000000001000000.000000', items: Array.from({ length: MAX_PLAN_ASSETS }, (_, index) => ({ mint: `${'123456789AB'[index]}${'1'.repeat(43)}`, percent: '0000000000010.00' })) };
    for (const mode of ['live', 'example'] as const) {
      const hash = encodePlanHash(basket, mode);
      expect(hash.length).toBeLessThanOrEqual(MAX_PLAN_HASH_LENGTH);
      expect(decodePlanHash(hash)).toEqual({ basket, mode });
    }
    const overLimit = { ...basket, items: [...basket.items, { mint: `B${'1'.repeat(43)}`, percent: '0' }] };
    expect(() => encodePlanHash(overLimit, 'live')).toThrow();
    expect(decodePlanHash(hashFor({ v: 1, mode: 'live', budget: overLimit.budget, items: overLimit.items.map(item => [item.mint, item.percent]) }))).toBeNull();
  });
});
