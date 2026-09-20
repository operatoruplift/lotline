import type { Basket, Mode } from './types';
import type { PlannerUniverse } from './planner-universe';

/** Includes draft strings and revision, so even a change-and-revert rejects an old request. */
export function createPlanIdentity(mode: Mode, basket: Basket, revision: number, universe: PlannerUniverse = 'xstocks'): string {
  return JSON.stringify([universe, mode, revision, basket.budget, basket.items.map(item => [item.mint, item.percent])]);
}

export function isCurrentResponse(expected: string, received: string): boolean {
  return expected === received;
}

export function isQuoteStale(fetchedAt: string, expiresAt: string, now = Date.now()): boolean {
  const fetched = Date.parse(fetchedAt);
  const expires = Date.parse(expiresAt);
  return !Number.isFinite(fetched) || !Number.isFinite(expires) || now >= Math.min(fetched + 30_000, expires);
}
