import { describe, expect, it } from 'vitest';
import { illustrativeStarter } from '../lib/domain/starter';
import { EXAMPLE_ASSETS } from '../lib/demo/example';
import { validatePlan } from '../lib/domain/math';

describe('explicit illustrative starter', () => {
  it('uses current catalog mint identities, not the bundled default plan', () => {
    const catalog = EXAMPLE_ASSETS.slice(0, 4).map((asset, index) => ({ ...asset, symbol: `CURRENT${index}` }));
    const items = illustrativeStarter(catalog.slice(1));
    expect(items.map(item => item.mint)).toEqual(catalog.slice(1).map(asset => asset.mint));
    expect(items.map(item => item.percent)).toEqual(['50', '30', '20']);
    const plan = validatePlan({ version: 1, budget: '10.000001', items });
    expect(plan.valid).toBe(true);
    expect(plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n)).toBe(10_000_001n);
  });

  it('excludes halted entries and duplicate mints, and requires three available identities', () => {
    const catalog = EXAMPLE_ASSETS.slice(0, 4);
    const selected = illustrativeStarter([{ ...catalog[0], halted: true }, catalog[1], catalog[1], catalog[2], catalog[3]]);
    expect(selected.map(item => item.mint)).toEqual(catalog.slice(1).map(asset => asset.mint));
    expect(illustrativeStarter([catalog[0], catalog[0], catalog[1]])).toEqual([]);
    expect(illustrativeStarter([])).toEqual([]);
  });
});
