import { describe, expect, it } from 'vitest';
import { readDevicePlans, sameSplit } from '../lib/client/device-plans';
import { REMINDER_STORAGE_KEY } from '../lib/client/reminder';
import { displayAmount } from '../lib/domain/format';
import { MARKET_IDENTITIES } from '../lib/domain/markets';
import { PLANNER_UNIVERSES } from '../lib/domain/planner-universe';
import { formatBps, mixKey, summarizePlan } from '../lib/domain/portfolio';
import type { Basket } from '../lib/domain/types';

const mint = (symbol: string) => MARKET_IDENTITIES.find(identity => identity.symbol === symbol)!.mint;
const storage = (entries: Record<string, unknown>) => ({ getItem: (key: string) => (key in entries ? JSON.stringify(entries[key]) : null) });
const plan = (budget: string, items: [string, string][]): Basket => ({ version: 1, budget, items: items.map(([symbol, percent]) => ({ mint: mint(symbol), percent })) });

describe('portfolio summary', () => {
  it('restates the planner’s exact split and groups it by asset type', () => {
    const summary = summarizePlan(plan('1000', [['AAPLx', '40'], ['SPYx', '25'], ['GLDx', '15'], ['SGOVx', '10'], ['TQQQx', '5'], ['NVDAx', '5']]));
    expect(summary.valid).toBe(true);
    expect(summary.budgetText).toBe('1000.000000');
    expect(summary.lines.map(line => line.usdcRaw)).toEqual(['400000000', '250000000', '150000000', '100000000', '50000000', '50000000']);
    expect(summary.mix).toEqual([
      { key: 'stocks', label: 'Stocks', bps: 4500 }, { key: 'etfs', label: 'ETFs', bps: 2500 }, { key: 'metals', label: 'Metals', bps: 1500 },
      { key: 'bonds', label: 'Bonds', bps: 1000 }, { key: 'leveraged', label: 'Leveraged ETFs', bps: 500 },
    ]);
  });

  it('keeps a half-finished draft readable without inventing amounts', () => {
    const summary = summarizePlan(plan('250', [['AAPLx', '60'], ['MSFTx', 'abc']]));
    expect(summary.valid).toBe(false);
    expect(summary.message).toMatch(/total exactly 100%|percentage/);
    expect(summary.assignedBps).toBe(6000);
    expect(summary.lines.map(line => [line.weightBps, line.usdcRaw])).toEqual([[6000, null], [null, null]]);
    expect(summary.budgetText).toBe('250.000000');
    expect(summarizePlan(plan('', [['AAPLx', '100']])).budgetText).toBeNull();
    expect(mixKey(MARKET_IDENTITIES.find(identity => identity.symbol === 'OPENAI')!)).toBe('pre-ipo');
  });

  it('groups pinned crypto as its own type', () => {
    const summary = summarizePlan({ version: 1, budget: '100', items: [{ mint: mint('AAPLx'), percent: '70' }, { mint: 'So11111111111111111111111111111111111111112', percent: '30' }] });
    expect(summary.mix).toEqual([{ key: 'stocks', label: 'Stocks', bps: 7000 }, { key: 'crypto', label: 'Crypto', bps: 3000 }]);
    expect(summary.lines[1].identity?.symbol).toBe('SOL');
  });

  it('formats basis points and decimal text for reading', () => {
    expect([formatBps(10_000), formatBps(2550), formatBps(1), formatBps(0)]).toEqual(['100%', '25.5%', '0.01%', '0%']);
    expect([displayAmount('1000.000000'), displayAmount('1234567.5', 0), displayAmount('0.100000', 2)]).toEqual(['1,000.00', '1,234,567.5', '0.10']);
  });
});

describe('device plans', () => {
  const reminder = { id: 'reminder-1', basket: plan('100', [['AAPLx', '100']]), mode: 'live', cadence: 'monthly', timezone: 'UTC', nextDueAt: '2026-10-01T09:00:00.000Z', paused: false, planVersion: 1 };
  it('reads each planner’s draft and the reminder from this device only', () => {
    const plans = readDevicePlans(storage({
      [PLANNER_UNIVERSES.xstocks.storageKey]: plan('100', [['AAPLx', '100']]),
      [PLANNER_UNIVERSES.prestocks.storageKey]: { version: 1, budget: '50', items: [] },
      [REMINDER_STORAGE_KEY]: reminder,
    }));
    expect(plans.drafts.xstocks?.items).toHaveLength(1);
    expect(plans.drafts.prestocks).toBeNull();
    expect(plans.reminder?.id).toBe('reminder-1');
    expect(sameSplit(plans.reminder!.basket, plans.drafts.xstocks!)).toBe(true);
    expect(sameSplit(plans.reminder!.basket, plan('100', [['AAPLx', '99.99']]))).toBe(false);
  });
  it('treats corrupt or unreadable storage as no plan', () => {
    expect(readDevicePlans(storage({ [REMINDER_STORAGE_KEY]: { ...reminder, cadence: 'daily' } })).reminder).toBeNull();
    expect(readDevicePlans({ getItem: () => { throw new Error('blocked'); } })).toEqual({ drafts: { xstocks: null, prestocks: null }, reminder: null });
  });
});
