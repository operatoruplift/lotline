import { marketIdentity, type MarketIdentity } from './markets';
import { formatUsdc, parseBudget, parsePercent, validatePlan } from './math';
import type { Basket } from './types';

/**
 * A read-only summary of a device draft for the Portfolio home. It restates
 * the plan's own numbers (weights and the planner's exact USDC split); it
 * never estimates holdings, returns or future values.
 */
export type MixKey = 'stocks' | 'etfs' | 'metals' | 'bonds' | 'leveraged' | 'pre-ipo';
export const MIX_LABELS: Readonly<Record<MixKey, string>> = {
  stocks: 'Stocks', etfs: 'ETFs', metals: 'Metals', bonds: 'Bonds', leveraged: 'Leveraged ETFs', 'pre-ipo': 'Pre-IPO',
};

export interface PortfolioLine {
  mint: string;
  identity: Readonly<MarketIdentity> | null;
  /** Null when the percentage cannot be read. */
  weightBps: number | null;
  /** The planner's exact share of the budget, present only when the whole plan validates. */
  usdcRaw: string | null;
}

export interface PortfolioSummary {
  lines: PortfolioLine[];
  /** Basis points assigned by readable percentages. */
  assignedBps: number;
  valid: boolean;
  /** Why the plan is not ready, in the planner's own words. */
  message?: string;
  mix: { key: MixKey; label: string; bps: number }[];
  budgetText: string | null;
}

export function mixKey(identity: MarketIdentity): MixKey {
  if (identity.leverage) return 'leveraged';
  if (identity.theme) return identity.theme;
  return identity.category;
}

export function summarizePlan(basket: Basket): PortfolioSummary {
  const validation = validatePlan(basket);
  const amounts = new Map(validation.allocations.map(allocation => [allocation.mint, allocation.usdcRaw]));
  const lines = basket.items.map((item): PortfolioLine => {
    let weightBps: number | null;
    try { weightBps = parsePercent(item.percent); } catch { weightBps = null; }
    return { mint: item.mint, identity: marketIdentity(item.mint) ?? null, weightBps, usdcRaw: amounts.get(item.mint) ?? null };
  });
  const assignedBps = lines.reduce((sum, line) => sum + (line.weightBps ?? 0), 0);
  const totals = new Map<MixKey, number>();
  for (const line of lines) {
    if (!line.identity || !line.weightBps) continue;
    const key = mixKey(line.identity);
    totals.set(key, (totals.get(key) ?? 0) + line.weightBps);
  }
  const mix = [...totals].map(([key, bps]) => ({ key, label: MIX_LABELS[key], bps })).sort((a, b) => b.bps - a.bps || a.label.localeCompare(b.label, 'en'));
  let budgetText: string | null = null;
  try { const budget = parseBudget(basket.budget); budgetText = budget > 0n ? formatUsdc(budget) : null; } catch { budgetText = null; }
  return { lines, assignedBps, valid: validation.valid, ...(validation.valid ? {} : { message: validation.message }), mix, budgetText };
}

/** Basis points as a percentage label with up to two decimals. */
export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  return `${whole}${fraction ? `.${String(fraction).padStart(2, '0').replace(/0$/, '')}` : ''}%`;
}
