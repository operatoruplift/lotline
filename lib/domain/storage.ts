import type { Basket } from './types';

export const BASKET_STORAGE_KEY = 'lotline:basket:v1';
const MAX_STORED_LENGTH = 2_048;
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Accept bounded draft inputs, so a reload can restore an unfinished plan safely. */
export function parseSavedBasket(value: unknown, allowedMints?: readonly string[]): Basket | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || typeof candidate.budget !== 'string' || candidate.budget.length > 32 || !/^[0-9.]*$/.test(candidate.budget)) return null;
  if (!Array.isArray(candidate.items) || candidate.items.length > 3) return null;
  const items: Basket['items'] = [];
  for (const item of candidate.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const entry = item as Record<string, unknown>;
    if (typeof entry.mint !== 'string' || !MINT_PATTERN.test(entry.mint) || (allowedMints && !allowedMints.includes(entry.mint))) return null;
    if (typeof entry.percent !== 'string' || entry.percent.length > 16 || !/^[0-9.]*$/.test(entry.percent)) return null;
    if (items.some(existing => existing.mint === entry.mint)) return null;
    items.push({ mint: entry.mint, percent: entry.percent });
  }
  // Copy only known fields; wallet addresses and untrusted extra fields never persist.
  return { version: 1, budget: candidate.budget, items };
}

export function loadBasket(storage: Pick<Storage, 'getItem'>, allowedMints?: readonly string[]): Basket | null {
  try {
    const raw = storage.getItem(BASKET_STORAGE_KEY);
    if (!raw || raw.length > MAX_STORED_LENGTH) return null;
    return parseSavedBasket(JSON.parse(raw), allowedMints);
  } catch {
    // Storage access can be disabled, or a previous entry can be corrupt.
    return null;
  }
}

export function saveBasket(storage: Pick<Storage, 'setItem'>, basket: Basket, allowedMints?: readonly string[]): boolean {
  try {
    const safe = parseSavedBasket(basket, allowedMints);
    if (!safe) return false;
    storage.setItem(BASKET_STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}
