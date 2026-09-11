import { describe, expect, it } from 'vitest';
import { DEFAULT_BASKET, EXAMPLE_ASSETS, EXAMPLE_CHAIN_TIME, exampleUnits, getExampleHoldings, getExampleQuotes } from '../lib/demo/example';
import { buildPlanCsv, buildPlanText, escapeCsvCell } from '../lib/domain/export';
import { createPlanIdentity, isCurrentResponse, isQuoteStale } from '../lib/domain/identity';
import { validatePlan } from '../lib/domain/math';
import { loadBasket, parseSavedBasket, saveBasket } from '../lib/domain/storage';

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
