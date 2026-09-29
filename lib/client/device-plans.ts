import { PLANNER_UNIVERSES, type PlannerUniverse } from '@/lib/domain/planner-universe';
import { loadBasket } from '@/lib/domain/storage';
import type { Basket } from '@/lib/domain/types';
import { readReminder, REMINDER_STORAGE_KEY, type SavedReminder } from './reminder';

export type DevicePlans = { drafts: Record<PlannerUniverse, Basket | null>; reminder: SavedReminder | null };

/** Everything the Portfolio home shows comes from here: this device's drafts and reminder, nothing remote. */
export function readDevicePlans(storage: Pick<Storage, 'getItem'>): DevicePlans {
  const draft = (universe: PlannerUniverse) => {
    const basket = loadBasket(storage, undefined, PLANNER_UNIVERSES[universe].storageKey);
    return basket && basket.items.length ? basket : null;
  };
  let reminder: SavedReminder | null = null;
  try { reminder = readReminder(storage.getItem(REMINDER_STORAGE_KEY)); } catch { reminder = null; }
  return { drafts: { xstocks: draft('xstocks'), prestocks: draft('prestocks') }, reminder };
}

/** Same mints and percentages in the same order: the reminder still describes this draft. */
export function sameSplit(a: Basket, b: Basket): boolean {
  return a.budget === b.budget && a.items.length === b.items.length && a.items.every((item, index) => item.mint === b.items[index].mint && item.percent === b.items[index].percent);
}
