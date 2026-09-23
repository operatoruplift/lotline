import { expect, it } from 'vitest';
import { quoteBenchmark } from '../lib/domain/quote-benchmark';
import { PYTH_FEED_MAPPINGS, PYTH_USDC_FEED_ID, pythConfidenceBps, pythDecimal } from '../lib/domain/market-reference';
import type { Quote } from '../lib/domain/types';
import { pythReferences } from './fixtures/pyth';

const now = Date.parse('2026-09-23T15:00:00Z');
const mint = PYTH_FEED_MAPPINGS[0].mint;
function references(usdcPrice = '100000000') {
  const response = pythReferences([mint], now);
  response.usdc = {
    ...response.items[0].underlying!, feedId: PYTH_USDC_FEED_ID, symbol: 'Crypto.USDC/USD', kind: 'currency', unitBasis: 'usdc-unit',
    price: usdcPrice, confidence: '10000', exponent: -8, displayPrice: pythDecimal(usdcPrice, -8), displayConfidence: '0.0001', confidenceBps: pythConfidenceBps(usdcPrice, '10000'),
  };
  return response;
}
function quote(changes: Partial<Quote> = {}): Quote {
  return {
    mint, state: 'success', usdcRaw: '220000000', outRaw: '100000000', units: '1.1', source: 'Jupiter',
    fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString(),
    unitContext: { source: 'clock-sysvar', kind: 'scaled', decimals: 8, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', mintSlot: 42, clockSlot: 42, unixTimestamp: String(now / 1000), observedAt: new Date(now).toISOString(), multiplier: 1.1 },
    ...changes,
  };
}

it('compares converted share exposure and converts USDC independently from USD', () => {
  expect(quoteBenchmark(quote(), references(), now)).toEqual({ state: 'available', usdPerShare: '200', differencePercent: '0', usdcUsd: '1', expiresAt: new Date(now + 30_000).toISOString() });
  expect(quoteBenchmark(quote(), references('98000000'), now)).toMatchObject({ state: 'available', usdPerShare: '196', differencePercent: '-2', usdcUsd: '0.98' });
  expect(quoteBenchmark(quote(), references('101000000'), now)).toMatchObject({ state: 'available', usdPerShare: '202', differencePercent: '1' });
});
it('uses integer ratios for large amounts and truncates negative and repeating decimals', () => {
  expect(quoteBenchmark(quote({ usdcRaw: '9007199254740993', units: '3' }), references(), now)).toMatchObject({ state: 'available', usdPerShare: '3002399751.580331', differencePercent: '1501199775.7901' });
  expect(quoteBenchmark(quote({ usdcRaw: '1000000', units: '3' }), references(), now)).toMatchObject({ state: 'available', usdPerShare: '0.33333333', differencePercent: '-99.8333' });
});
it('does not use a token feed or require its unit basis to be equivalent', () => {
  const data = references();
  delete data.items[0].token;
  data.items[0].state = 'partial'; data.items[0].comparison = 'not-comparable'; delete data.items[0].comparisonRatio;
  expect(quoteBenchmark(quote(), data, now).state).toBe('available');
});
it('expires at the earliest original quote, conversion or price expiry', () => {
  const data = references();
  expect(quoteBenchmark(quote(), data, now + 30_000).state).toBe('unavailable');
  const earlyQuote = quote({ expiresAt: new Date(now + 5_000).toISOString() });
  expect(quoteBenchmark(earlyQuote, data, now)).toMatchObject({ expiresAt: new Date(now + 5_000).toISOString() });
  expect(quoteBenchmark(earlyQuote, references(), now + 5_000).state).toBe('unavailable');
  const oldContext = quote(); oldContext.unitContext!.observedAt = new Date(now - 29_000).toISOString();
  expect(quoteBenchmark(oldContext, data, now)).toMatchObject({ expiresAt: new Date(now + 1_000).toISOString() });
  expect(quoteBenchmark(oldContext, data, now + 1_000).state).toBe('unavailable');
});
it('requires fresh pinned equity and currency feeds without parity fallback', () => {
  for (const field of ['usdc', 'underlying'] as const) {
    const data = references();
    const observation = field === 'usdc' ? data.usdc! : data.items[0].underlying!;
    observation.feedId = 'a'.repeat(64);
    expect(quoteBenchmark(quote(), data, now).state).toBe('unavailable');
  }
  const absent = references(); delete absent.usdc;
  expect(quoteBenchmark(quote(), absent, now).state).toBe('unavailable');
  const stale = references(); stale.usdc!.state = 'stale';
  expect(quoteBenchmark(quote(), stale, now).state).toBe('unavailable');
  expect(quoteBenchmark(quote({ fetchedAt: new Date(now + 1_000).toISOString() }), references(), now).state).toBe('unavailable');
});
it.each([
  { state: 'unavailable' as const }, { mint: 'unmapped' }, { units: null }, { units: '0' }, { units: '1e9' }, { units: '-2' },
  { usdcRaw: '0' }, { outRaw: '0' }, { usdcRaw: '1'.repeat(21) }, { unitContext: undefined }, { expiresAt: 'invalid' },
])('does not benchmark malformed or unverified quote context %j', changes => {
  expect(quoteBenchmark(quote(changes), references(), now).state).toBe('unavailable');
});
it('rejects missing or inconsistent chain conversion provenance', () => {
  for (const changes of [{ clockSlot: 43 }, { kind: 'standard' }, { multiplier: 0 }, { observedAt: new Date(now + 1).toISOString() }, { decimals: 19 }, { tokenProgram: 'other' }]) {
    const value = quote(); Object.assign(value.unitContext!, changes);
    expect(quoteBenchmark(value, references(), now).state).toBe('unavailable');
  }
});
it('rejects JSON values with the wrong runtime type before arithmetic', () => {
  for (const changes of [{ usdcRaw: 220000000 }, { outRaw: 100000000 }, { units: 1.1 }]) {
    expect(quoteBenchmark({ ...quote(), ...changes } as unknown as Quote, references(), now).state).toBe('unavailable');
  }
});
