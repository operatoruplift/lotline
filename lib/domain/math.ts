import type { Basket } from './types';

export const USDC_DECIMALS = 6;
export const MAX_BUDGET_USDC = 1_000_000;
export const MAX_BUDGET_RAW = 1_000_000_000_000n;
const TOTAL_BPS = 10_000;

/** Parse plain USDC decimals without passing money through binary floats. */
export function parseBudget(input: string): bigint {
  if (typeof input !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(input) || input.length > 32) {
    throw new Error('Enter a USDC amount using up to 6 decimal places.');
  }
  const [whole, fraction = ''] = input.split('.');
  const raw = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (raw > MAX_BUDGET_RAW) throw new Error('Enter a budget of 1,000,000 USDC or less.');
  return raw;
}

/** Percent inputs become integral basis points (one hundredth of a percent). */
export function parsePercent(input: string): number {
  if (typeof input !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(input) || input.length > 16) {
    throw new Error('Use a percentage with up to 2 decimal places.');
  }
  const [whole, fraction = ''] = input.split('.');
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (bps > 10_000n) throw new Error('Each percentage must be between 0 and 100.');
  return Number(bps);
}

export function formatUsdc(raw: bigint | string): string {
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) throw new Error('Invalid raw USDC amount.');
  const amount = BigInt(raw);
  if (amount < 0n) throw new Error('Invalid raw USDC amount.');
  return `${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, '0')}`;
}

/** Largest remainder allocation; basket order is the explicit final tie breaker. */
export function allocate(budgetRaw: bigint, weightsBps: number[]): bigint[] {
  if (budgetRaw < 0n || budgetRaw > MAX_BUDGET_RAW) throw new Error('Budget is outside the supported range.');
  if (weightsBps.length < 1 || weightsBps.length > 3 || weightsBps.some(weight => !Number.isSafeInteger(weight) || weight < 0 || weight > TOTAL_BPS)) {
    throw new Error('Choose one to three assets with valid percentages.');
  }
  if (weightsBps.reduce((sum, weight) => sum + weight, 0) !== TOTAL_BPS) {
    throw new Error('Your contribution percentages must total 100%.');
  }
  const entries = weightsBps.map((weight, index) => {
    const product = budgetRaw * BigInt(weight);
    return { index, amount: product / 10_000n, remainder: product % 10_000n };
  });
  const allocations = entries.map(entry => entry.amount);
  let remaining = budgetRaw - allocations.reduce((sum, amount) => sum + amount, 0n);
  const priority = [...entries].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const entry of priority) {
    if (remaining === 0n) break;
    allocations[entry.index] += 1n;
    remaining -= 1n;
  }
  return allocations;
}

export type PlanAllocation = { mint: string; usdcRaw: string; weightBps: number };
export type PlanValidation = { valid: boolean; message?: string; allocations: PlanAllocation[] };

export function validatePlan(basket: Basket): PlanValidation {
  try {
    if (!basket || basket.version !== 1 || !Array.isArray(basket.items) || basket.items.length < 1 || basket.items.length > 3) {
      throw new Error('Choose one to three verified xStocks to make your plan.');
    }
    if (basket.items.some(item => !item || typeof item.mint !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(item.mint))) {
      throw new Error('Choose a verified xStock for every allocation.');
    }
    if (new Set(basket.items.map(item => item.mint)).size !== basket.items.length) {
      throw new Error('Choose each xStock only once.');
    }
    const weights = basket.items.map(item => parsePercent(item.percent));
    if (weights.reduce((sum, weight) => sum + weight, 0) !== TOTAL_BPS) {
      throw new Error('Set your contribution percentages to total exactly 100%.');
    }
    const budget = parseBudget(basket.budget);
    if (budget === 0n) throw new Error('Enter a USDC budget greater than zero to get estimates.');
    const amounts = allocate(budget, weights);
    return { valid: true, allocations: basket.items.map((item, index) => ({ mint: item.mint, usdcRaw: amounts[index].toString(), weightBps: weights[index] })) };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : 'Check your budget and percentages.', allocations: [] };
  }
}
