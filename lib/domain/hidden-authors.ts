import type { GalleryPlan } from './gallery';

/**
 * Authors a reader chose not to see in community plans, kept on their device.
 * The key is the gallery's salted author key, which never names an account;
 * the name is the display name shown when the reader hid them.
 */
export interface HiddenAuthor { key: string; name: string | null; since: string }

export const MAX_HIDDEN_AUTHORS = 100;

/** Hide an author, or refresh their name: newest first, one entry each, capped. */
export function withHiddenAuthor(list: readonly HiddenAuthor[], author: { author_key: string; display_name: string | null }, now: Date = new Date()): HiddenAuthor[] {
  const existing = list.find(item => item.key === author.author_key);
  const next: HiddenAuthor = { key: author.author_key, name: author.display_name, since: existing?.since ?? now.toISOString() };
  return [next, ...list.filter(item => item.key !== author.author_key)].slice(0, MAX_HIDDEN_AUTHORS);
}

export function withoutHiddenAuthor(list: readonly HiddenAuthor[], key: string): HiddenAuthor[] {
  return list.filter(item => item.key !== key);
}

/** The plans left once hidden authors are taken out. A plan without a key always stays. */
export function visiblePlans<T extends Pick<GalleryPlan, 'author_key'>>(plans: readonly T[], hidden: readonly HiddenAuthor[]): T[] {
  if (!hidden.length) return [...plans];
  const keys = new Set(hidden.map(item => item.key));
  return plans.filter(plan => !plan.author_key || !keys.has(plan.author_key));
}
