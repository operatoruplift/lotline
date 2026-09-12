import { describe, expect, it } from 'vitest';
import { DEFAULT_BASKET, EXAMPLE_ASSETS, EXAMPLE_CHAIN_TIME, exampleUnits, getExampleHoldings, getExampleQuotes } from '../lib/demo/example';
import { buildPlanCsv, buildPlanText, escapeCsvCell } from '../lib/domain/export';
import { createPlanIdentity, isCurrentResponse, isQuoteStale } from '../lib/domain/identity';
import { validatePlan } from '../lib/domain/math';
import { loadBasket, parseSavedBasket, saveBasket } from '../lib/domain/storage';
import { MAX_PLAN_ASSETS } from '../lib/domain/limits';
import type { Quote } from '../lib/domain/types';

describe('safe local basket storage', () => {
  it('recovers corrupt JSON, disabled storage, unsupported versions and invalid shapes safely', () => {
    expect(loadBasket({ getItem: () => '{broken' })).toBeNull();
    expect(loadBasket({ getItem: () => { throw new Error('denied'); } })).toBeNull();
    expect(parseSavedBasket({ ...DEFAULT_BASKET, version: 2 })).toBeNull();
    expect(parseSavedBasket({ ...DEFAULT_BASKET, items: Array(4).fill(DEFAULT_BASKET.items[0]) })).toBeNull();
    expect(parseSavedBasket({ ...DEFAULT_BASKET, budget: '=cmd()' })).toBeNull();
    expect(parseSavedBasket(DEFAULT_BASKET, [])).toBeNull();
  });
  it('restores drafts but persists only known fields, never an injected wallet', () => {
    const draft = { ...DEFAULT_BASKET, budget: '', wallet: 'must not be saved' };
    let saved = '';
    expect(saveBasket({ setItem: (_key, value) => { saved = value; } }, draft)).toBe(true);
    expect(saved).not.toContain('wallet');
    expect(loadBasket({ getItem: () => saved })).toEqual({ version: 1, budget: '', items: draft.items });
    expect(saveBasket({ setItem: () => { throw new Error('quota'); } }, DEFAULT_BASKET)).toBe(false);
  });
  it('persists an intentionally cleared basket instead of resurrecting prior assets', () => {
    let stored = JSON.stringify(DEFAULT_BASKET);
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    const cleared = { ...DEFAULT_BASKET, items: [] };
    expect(saveBasket(storage, cleared)).toBe(true);
    expect(loadBasket(storage)).toEqual(cleared);
    expect(validatePlan(cleared).valid).toBe(false);
  });
  it('round-trips ten maximal-length draft entries within the storage budget', () => {
    const draft = { version: 1 as const, budget: '000000000000000001000000.000000', items: Array.from({ length: MAX_PLAN_ASSETS }, (_, index) => ({ mint: `${'123456789AB'[index]}${'1'.repeat(43)}`, percent: '0000000000010.00' })) };
    let stored = '';
    expect(saveBasket({ setItem: (_key, value) => { stored = value; } }, draft)).toBe(true);
    expect(stored.length).toBeLessThanOrEqual(2048);
    expect(loadBasket({ getItem: () => stored })).toEqual(draft);
    const overLimit = { ...draft, items: [...draft.items, { mint: `B${'1'.repeat(43)}`, percent: '0' }] };
    expect(parseSavedBasket(overLimit)).toBeNull();
    expect(saveBasket({ setItem: () => { throw new Error('must not write'); } }, overLimit)).toBe(false);
  });
});

describe('obsolete response rejection and quote age', () => {
  it('rejects old budgets, basket order, modes, and change-and-revert revisions', () => {
    const original = createPlanIdentity('live', DEFAULT_BASKET, 1);
    expect(isCurrentResponse(original, original)).toBe(true);
    expect(isCurrentResponse(original, createPlanIdentity('live', { ...DEFAULT_BASKET, budget: '1200' }, 1))).toBe(false);
    expect(isCurrentResponse(original, createPlanIdentity('example', DEFAULT_BASKET, 1))).toBe(false);
    expect(isCurrentResponse(original, createPlanIdentity('live', DEFAULT_BASKET, 3))).toBe(false);
    expect(isCurrentResponse(original, createPlanIdentity('live', { ...DEFAULT_BASKET, items: [...DEFAULT_BASKET.items].reverse() }, 1))).toBe(false);
  });
  it('uses the earliest of thirty seconds and provider expiry, rejecting invalid times', () => {
    const fetched = '2026-09-11T00:00:00.000Z';
    const start = Date.parse(fetched);
    expect(isQuoteStale(fetched, '2026-09-11T00:01:00.000Z', start + 29_999)).toBe(false);
    expect(isQuoteStale(fetched, '2026-09-11T00:01:00.000Z', start + 30_000)).toBe(true);
    expect(isQuoteStale(fetched, '2026-09-11T00:00:10.000Z', start + 10_000)).toBe(true);
    expect(isQuoteStale('invalid', 'invalid', start)).toBe(true);
  });
});

describe('honest example fixtures and exports', () => {
  const allocations = validatePlan(DEFAULT_BASKET).allocations;
  const quotes = getExampleQuotes(allocations).quotes;
  const input = { mode: 'example' as const, basket: DEFAULT_BASKET, assets: EXAMPLE_ASSETS, quotes };
  it('uses nonunit scaling and scheduled multiplier activation on raw sums', () => {
    const mint = EXAMPLE_ASSETS[0].mint;
    expect(exampleUnits(mint, '200000000')).toBe('2.5');
    expect(exampleUnits(mint, '200000000', EXAMPLE_CHAIN_TIME + 86_399)).toBe('2.5');
    expect(exampleUnits(mint, '200000000', EXAMPLE_CHAIN_TIME + 86_400)).toBe('3');
    expect(exampleUnits(mint, 200_000_000n + BigInt(quotes[0].outRaw!))).toBe('4.5');
    expect(exampleUnits('unknown', '1')).toBeNull();
    expect(getExampleHoldings([EXAMPLE_ASSETS[3].mint, 'unknown']).holdings.map(item => item.raw)).toEqual(['0', null]);
  });
  it('returns deterministic raw outputs and skips zero allocations', () => {
    expect(getExampleQuotes(allocations).quotes.map(quote => quote.outRaw)).toEqual(quotes.map(quote => quote.outRaw));
    expect(getExampleQuotes([{ mint: EXAMPLE_ASSETS[0].mint, usdcRaw: '0' }]).quotes).toEqual([]);
  });
  it('returns and exports every selected example asset beyond the original three', () => {
    const selected = EXAMPLE_ASSETS.slice(-MAX_PLAN_ASSETS);
    const expanded = { ...DEFAULT_BASKET, budget: '10.000001', items: selected.map(asset => ({ mint: asset.mint, percent: '10' })) };
    const plan = validatePlan(expanded);
    expect(plan.valid).toBe(true);
    const estimates = getExampleQuotes(plan.allocations);
    expect(estimates.quotes).toHaveLength(MAX_PLAN_ASSETS);
    expect(estimates.state).toBe('success');
    expect(getExampleHoldings(expanded.items.map(item => item.mint)).holdings).toHaveLength(MAX_PLAN_ASSETS);
    expect(plan.allocations.reduce((total, item) => total + BigInt(item.usdcRaw), 0n)).toBe(10_000_001n);
    const csv = buildPlanCsv({ ...input, basket: expanded, quotes: estimates.quotes });
    for (const asset of selected) expect(csv).toContain(asset.mint);
    expect(csv).toContain('1.000001');
    expect(csv).toContain('Example (synthetic estimates)');
  });
  it('exports verified identity, exact budgets, example label and review warning', () => {
    const csv = buildPlanCsv(input);
    const text = buildPlanText(input);
    expect(csv).toContain('Example (synthetic estimates)');
    expect(csv).toContain('500.000000');
    expect(csv).toContain(EXAMPLE_ASSETS[0].mint);
    expect(csv).toContain('Review on Jupiter before trading.');
    expect(text).toContain('Budget: 1000.000000 USDC');
    expect(text).toContain(quotes[0].fetchedAt);
    expect(buildPlanText({ ...input, quotes: [{ ...quotes[0], usdcRaw: '1' }] })).toContain('Estimated units: Unavailable');
  });
  it('escapes CSV quotes/newlines and prevents formula injection after whitespace', () => {
    for (const dangerous of ['=HYPERLINK("bad")', '+cmd', '-cmd', '@SUM(A1)', '\t=cmd', '  +cmd']) expect(escapeCsvCell(dangerous).startsWith('"\'')).toBe(true);
    expect(escapeCsvCell('line\n"quoted"')).toBe('"line\n""quoted"""');
    const malicious = EXAMPLE_ASSETS.map((asset, index) => index === 0 ? { ...asset, symbol: '=HYPERLINK("bad")' } : asset);
    expect(buildPlanCsv({ ...input, assets: malicious })).toContain('"\'=HYPERLINK(""bad"")"');
  });
});

describe('exported estimate freshness', () => {
  const fetchedAt = '2026-09-12T10:00:00.000Z';
  const start = Date.parse(fetchedAt);
  const basket = { ...DEFAULT_BASKET, budget: '10.000001' };
  const allocations = validatePlan(basket).allocations;
  const quotes: Quote[] = allocations.map(allocation => ({
    mint: allocation.mint, usdcRaw: allocation.usdcRaw, state: 'success',
    outRaw: '123000000', units: '1.5375', fetchedAt,
    expiresAt: '2026-09-12T10:01:00.000Z', source: 'Jupiter · metis',
  }));
  const input = { mode: 'live' as const, basket, assets: EXAMPLE_ASSETS, quotes };

  it('keeps exact amounts and original sources while stamping the single export instant', () => {
    const csv = buildPlanCsv(input, start + 29_999);
    const text = buildPlanText(input, start + 29_999);
    expect(csv).toContain('"5.000001"');
    expect(csv).toContain('"3.000000"');
    expect(csv).toContain('"2.000000"');
    expect(csv.match(/"Fresh at export"/g)).toHaveLength(3);
    expect(csv.match(/"2026-09-12T10:00:29.999Z"/g)).toHaveLength(3);
    expect(csv).toContain('"Quote fresh until (UTC)"');
    expect(csv).toContain('"2026-09-12T10:00:30.000Z"');
    expect(text).toContain('Quote source: Jupiter · metis');
    expect(text).toContain(`Quote retrieved: ${fetchedAt}`);
    expect(text).toContain('Exported at: 2026-09-12T10:00:29.999Z');
    expect(text).toContain('Exporting does not refresh estimates.');
    expect(quotes.every(quote => quote.fetchedAt === fetchedAt && quote.expiresAt === '2026-09-12T10:01:00.000Z')).toBe(true);
  });

  it('marks old units stale at the exact deadline without hiding the historical estimate', () => {
    const csv = buildPlanCsv(input, start + 30_000);
    const text = buildPlanText(input, start + 30_000);
    expect(csv.match(/"Stale — refresh required"/g)).toHaveLength(3);
    expect(csv).not.toContain('"Fresh at export"');
    expect(text).toContain('Estimated units: 1.5375');
    expect(text).toContain('Estimate status at export: Stale — refresh required');
    expect(text).toContain(`Quote retrieved: ${fetchedAt}`);
  });

  it('honors earlier provider expiry and independent original batch times', () => {
    const mixed = [
      { ...quotes[0], expiresAt: '2026-09-12T10:00:05.000Z' },
      { ...quotes[1], fetchedAt: '2026-09-12T10:00:02.000Z' },
      { ...quotes[2], fetchedAt: '2026-09-12T10:00:04.000Z' },
    ];
    const csv = buildPlanCsv({ ...input, quotes: mixed }, start + 5_000);
    expect(csv.match(/"Stale — refresh required"/g)).toHaveLength(1);
    expect(csv.match(/"Fresh at export"/g)).toHaveLength(2);
    for (const expiry of ['2026-09-12T10:00:05.000Z', '2026-09-12T10:00:32.000Z', '2026-09-12T10:00:34.000Z']) expect(csv).toContain(`"${expiry}"`);
    for (const quote of mixed) expect(csv).toContain(`"${quote.fetchedAt}"`);
  });

  it('distinguishes absent or mismatched requests from provider and unit failures', () => {
    const partial: Quote[] = [
      { ...quotes[0], usdcRaw: '1' },
      { ...quotes[1], state: 'unavailable', outRaw: null, units: null },
      { ...quotes[2], units: null },
    ];
    const csv = buildPlanCsv({ ...input, quotes: partial }, start + 1_000);
    expect(csv.match(/"Not requested"/g)).toHaveLength(1);
    expect(csv).toContain('"Unavailable — units could not be verified"');
    expect(csv).toContain('"Unavailable","2026-09-12T10:00:01.000Z"');
    expect(csv).not.toContain('"Fresh at export"');
    expect(buildPlanText({ ...input, quotes: [] }, start)).toContain('Estimate status at export: Not requested');
  });

  it.each([
    { fetchedAt: 'invalid', expiresAt: '2026-09-12T10:01:00.000Z' },
    { fetchedAt, expiresAt: 'invalid' },
    { fetchedAt: '2026-09-12T10:00:02.000Z', expiresAt: '2026-09-12T10:01:00.000Z' },
    { fetchedAt, expiresAt: fetchedAt },
    { fetchedAt, expiresAt: '2026-09-12T09:59:59.000Z' },
  ])('fails closed for invalid or inconsistent quote timing: %j', dates => {
    const invalid = { ...quotes[0], ...dates };
    const text = buildPlanText({ ...input, quotes: [invalid] }, start + 1_000);
    expect(text).toContain('Estimate status at export: Unavailable — invalid quote timestamps');
    expect(text).toContain('Estimated units: Unavailable');
    expect(text).toContain('Fresh until: Unavailable');
    expect(text).toContain(`Quote retrieved: ${dates.fetchedAt}`);
    expect(text).not.toContain('Fresh at export');
  });

  it('escapes every added provider-controlled CSV field and rejects invalid export clocks', () => {
    const csv = buildPlanCsv({ ...input, quotes: [{ ...quotes[0], source: '=HYPERLINK("bad")', fetchedAt: '\t=cmd()' }] }, start);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\'\t=cmd()"');
    expect(() => buildPlanCsv(input, NaN)).toThrow();
    expect(() => buildPlanText(input, Infinity)).toThrow();
  });
});
