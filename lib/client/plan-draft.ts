import { addAssetToBasket, marketIdentity } from '@/lib/domain/markets';
import { PLANNER_UNIVERSES } from '@/lib/domain/planner-universe';
import { loadBasket, saveBasket } from '@/lib/domain/storage';
import type { Basket } from '@/lib/domain/types';

const EMPTY: Basket = { version: 1, budget: '1000', items: [] };
export type DraftAddition =
  | { ok: true; symbol: string; percent: string; path: string }
  | { ok: false; reason: 'duplicate' | 'full' | 'unknown' | 'storage'; symbol?: string; path?: string };

/** Mints already in each device draft, for "In your plan" states. */
export function draftMints(storage: Pick<Storage, 'getItem'>): Set<string> {
  const mints = new Set<string>();
  for (const universe of Object.values(PLANNER_UNIVERSES)) {
    for (const item of loadBasket(storage, undefined, universe.storageKey)?.items ?? []) mints.add(item.mint);
  }
  return mints;
}

/**
 * Adds a verified catalog asset to the matching device draft. The planner reads
 * the same draft on its next load; nothing is quoted, bought or uploaded here.
 */
export function addToDraft(storage: Pick<Storage, 'getItem' | 'setItem'>, mint: string): DraftAddition {
  const identity = marketIdentity(mint);
  if (!identity) return { ok: false, reason: 'unknown' };
  const universe = PLANNER_UNIVERSES[identity.universe];
  const current = loadBasket(storage, undefined, universe.storageKey) ?? EMPTY;
  const result = addAssetToBasket(current, mint, identity.universe);
  if (!result.ok) return { ok: false, reason: result.reason, symbol: identity.symbol, path: universe.path };
  if (!saveBasket(storage, result.basket, undefined, universe.storageKey)) return { ok: false, reason: 'storage', symbol: identity.symbol, path: universe.path };
  return { ok: true, symbol: identity.symbol, percent: result.percent, path: universe.path };
}
