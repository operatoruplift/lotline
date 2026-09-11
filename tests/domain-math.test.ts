import { describe, expect, it } from 'vitest';
import { allocate, formatUsdc, MAX_BUDGET_RAW, parseBudget, parsePercent, validatePlan } from '../lib/domain/math';
import { DEFAULT_BASKET } from '../lib/demo/example';

describe('exact USDC parsing', () => {
  it('parses decimal strings into micro-units exactly, including the documented limit', () => {
    expect(parseBudget('10.000001')).toBe(10_000_001n);
    expect(parseBudget('0.000001')).toBe(1n);
    expect(parseBudget('0')).toBe(0n);
    expect(parseBudget('1000000')).toBe(MAX_BUDGET_RAW);
    expect(formatUsdc(parseBudget('0.1'))).toBe('0.100000');
  });
  it.each(['', ' ', '-1', '+1', '1e3', 'Infinity', 'NaN', '0.0000001', '.1', '1.', ' 1', '1,000', '1000000.000001'])("rejects '%s'", input => {
    expect(() => parseBudget(input)).toThrow();
  });
  it('formats exact micro-units rather than rounding through Number', () => {
    expect(formatUsdc(10_000_001n)).toBe('10.000001');
    expect(formatUsdc('1')).toBe('0.000001');
    expect(() => formatUsdc('-1')).toThrow();
  });
});

describe('basis point percentages', () => {
  it('preserves hundredths of a percent', () => {
    expect(parsePercent('33.34')).toBe(3334);
    expect(parsePercent('100')).toBe(10000);
    expect(parsePercent('0.01')).toBe(1);
  });
  it.each(['', '-1', 'NaN', '1e1', '33.333', '100.01'])("rejects '%s'", input => expect(() => parsePercent(input)).toThrow());
});

describe('largest remainder allocations', () => {
  it('satisfies all three required examples', () => {
    expect(allocate(parseBudget('10.000001'), [5000, 3000, 2000]).map(formatUsdc)).toEqual(['5.000001', '3.000000', '2.000000']);
    expect(allocate(parseBudget('1'), [3334, 3333, 3333]).map(formatUsdc)).toEqual(['0.333400', '0.333300', '0.333300']);
    expect(allocate(1n, [3334, 3333, 3333])).toEqual([1n, 0n, 0n]);
  });
  it('breaks equal remainders in stable basket order', () => {
    expect(allocate(1n, [5000, 5000])).toEqual([1n, 0n]);
    expect(allocate(2n, [3333, 3333, 3334])).toEqual([1n, 0n, 1n]);
  });
  it('always allocates the full budget and never funds zero weights', () => {
    for (const budget of [0n, 1n, 2n, 3n, 17n, 1_000_001n, MAX_BUDGET_RAW]) {
      for (const weights of [[5000, 3000, 2000], [1, 9998, 1], [0, 10000], [3333, 3333, 3334]]) {
        const allocations = allocate(budget, weights);
        expect(allocations.reduce((sum, raw) => sum + raw, 0n)).toBe(budget);
        allocations.forEach((raw, index) => { expect(raw >= 0n).toBe(true); if (weights[index] === 0) expect(raw).toBe(0n); });
      }
    }
  });
  it('rejects incomplete, all-zero, fractional, and excessive selections', () => {
    for (const weights of [[0, 0], [5000, 2000], [5000.1, 4999.9], [2500, 2500, 2500, 2500], [-1, 10001]]) expect(() => allocate(1n, weights)).toThrow();
  });
  it('returns actionable validation and prevents duplicate mints', () => {
    expect(validatePlan(DEFAULT_BASKET).valid).toBe(true);
    expect(validatePlan({ ...DEFAULT_BASKET, budget: '0' }).message).toMatch(/greater than zero/);
    expect(validatePlan({ ...DEFAULT_BASKET, items: DEFAULT_BASKET.items.map(item => ({ ...item, percent: '0' })) }).message).toMatch(/100%/);
    expect(validatePlan({ ...DEFAULT_BASKET, items: [DEFAULT_BASKET.items[0], DEFAULT_BASKET.items[0]] }).valid).toBe(false);
  });
});
