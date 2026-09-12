import { describe, expect, it } from 'vitest';
import { DEFAULT_BASKET, EXAMPLE_ASSETS, EXAMPLE_CHAIN_TIME, exampleUnits, getExampleHoldings, getExampleQuotes } from '../lib/demo/example';
import { XSTOCK_REGISTRY } from '../lib/domain/assets';
import { MAX_PLAN_ASSETS } from '../lib/domain/limits';
import { validatePlan } from '../lib/domain/math';
import { decodePlanHash, encodePlanHash } from '../lib/domain/share';
import { loadBasket, saveBasket } from '../lib/domain/storage';
import evidence from '../docs/xstocks-catalog-verification.json';

describe('complete, explicitly synthetic Example catalog', () => {
  it('reuses every reviewed identity, mint precision and official local logo without claiming a fresh check', () => {
    expect(EXAMPLE_ASSETS).toHaveLength(XSTOCK_REGISTRY.length);
    expect(EXAMPLE_ASSETS.length).toBeGreaterThan(800);
    expect(new Set(EXAMPLE_ASSETS.map(asset => asset.mint)).size).toBe(EXAMPLE_ASSETS.length);
    for (const [index, identity] of XSTOCK_REGISTRY.entries()) {
      expect(EXAMPLE_ASSETS[index]).toMatchObject(identity);
      expect(EXAMPLE_ASSETS[index].verifiedAt).toBe(evidence.verifiedAt);
    }
  });

  it('preserves the original six fixtures and the three-asset 50/30/20 walkthrough', () => {
    expect(EXAMPLE_ASSETS.slice(0, 6).map(asset => asset.symbol)).toEqual(['AAPLx', 'MSFTx', 'NVDAx', 'TSLAx', 'SPYx', 'QQQx']);
    expect(DEFAULT_BASKET.budget).toBe('1000');
    expect(DEFAULT_BASKET.items.map(item => item.percent)).toEqual(['50', '30', '20']);
    const six = EXAMPLE_ASSETS.slice(0, 6);
    expect(getExampleHoldings(six.map(asset => asset.mint)).holdings.map(holding => holding.raw))
      .toEqual(['200000000', '100000000', '300000000', '0', '50000000', '0']);
    expect(getExampleQuotes(six.map(asset => ({ mint: asset.mint, usdcRaw: '100000000' }))).quotes.map(quote => quote.outRaw))
      .toEqual(['32000000', '25000000', '44444444', '40000000', '16666666', '20000000']);
    expect(exampleUnits(six[0].mint, '200000000', EXAMPLE_CHAIN_TIME)).toBe('2.5');
    expect(exampleUnits(six[0].mint, '200000000', EXAMPLE_CHAIN_TIME + 86_400)).toBe('3');
    expect(exampleUnits(six[2].mint, '300000000')).toBe('4.5');
  });

  it('supports every additional asset with deterministic generic units and known synthetic zero holdings', () => {
    const additional = EXAMPLE_ASSETS.slice(6);
    const requests = additional.map(asset => ({ mint: asset.mint, usdcRaw: '100000000' }));
    const first = getExampleQuotes(requests);
    const second = getExampleQuotes(requests);
    const holdings = getExampleHoldings(additional.map(asset => asset.mint));
    expect(first.state).toBe('success');
    expect(holdings.state).toBe('success');
    expect(first.quotes).toHaveLength(additional.length);
    expect(first.quotes.map(quote => quote.outRaw)).toEqual(second.quotes.map(quote => quote.outRaw));
    for (const [index, asset] of additional.entries()) {
      const quote = first.quotes[index];
      expect(quote).toMatchObject({ mint: asset.mint, units: '1', outRaw: (10n ** BigInt(asset.decimals)).toString(), source: 'Synthetic example' });
      expect(Date.parse(quote.expiresAt) - Date.parse(quote.fetchedAt)).toBe(30_000);
      expect(holdings.holdings[index]).toEqual({ mint: asset.mint, state: 'success', raw: '0', units: '0' });
      expect(exampleUnits(asset.mint, BigInt(holdings.holdings[index].raw!) + BigInt(quote.outRaw!))).toBe('1');
    }
  });

  it('keeps unknown mints and invalid raw inputs unavailable', () => {
    for (const mint of ['unknown', '__proto__', '11111111111111111111111111111111']) {
      expect(exampleUnits(mint, '100000000')).toBeNull();
      expect(getExampleHoldings([mint]).holdings[0]).toMatchObject({ state: 'unavailable', raw: null, units: null });
      expect(getExampleQuotes([{ mint, usdcRaw: '100000000' }]).quotes[0]).toMatchObject({ state: 'unavailable', outRaw: null, units: null, message: 'This asset is not in the example catalog.' });
    }
    const mint = EXAMPLE_ASSETS.at(-1)!.mint;
    for (const usdcRaw of ['-1', '1.1', 'NaN', '10000000000000']) {
      expect(getExampleQuotes([{ mint, usdcRaw }]).quotes[0]).toMatchObject({ state: 'unavailable', outRaw: null, units: null });
    }
    expect(getExampleQuotes([{ mint, usdcRaw: '0' }]).quotes).toEqual([]);
  });

  it('preserves a ten-asset non-default split through share review payloads and device reload', () => {
    const basket = { version: 1 as const, budget: '10.000001', items: EXAMPLE_ASSETS.slice(-MAX_PLAN_ASSETS).map(asset => ({ mint: asset.mint, percent: '10' })) };
    const plan = validatePlan(basket);
    expect(plan.valid).toBe(true);
    expect(plan.allocations[0].usdcRaw).toBe('1000001');
    expect(plan.allocations.slice(1).every(item => item.usdcRaw === '1000000')).toBe(true);
    expect(decodePlanHash(encodePlanHash(basket, 'example'))).toEqual({ basket, mode: 'example' });
    let saved = '';
    const allowed = EXAMPLE_ASSETS.map(asset => asset.mint);
    expect(saveBasket({ setItem: (_key, value) => { saved = value; } }, basket, allowed)).toBe(true);
    expect(loadBasket({ getItem: () => saved }, allowed)).toEqual(basket);
    expect(validatePlan({ ...basket, items: [...basket.items, { mint: EXAMPLE_ASSETS[0].mint, percent: '0' }] }).valid).toBe(false);
  });
});
