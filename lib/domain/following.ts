import type { GalleryPlan } from './gallery';

/**
 * Following a shared plan, kept on the member's device: the split they last
 * accepted from its author. Lotline never applies a change; it shows what
 * changed and the member reviews it with their own budget, or keeps theirs.
 */
export interface FollowedPlan {
  /** The shared plan's id. */
  id: string;
  /** Its name and author when last accepted, shown if it stops being shared. */
  name: string;
  displayName: string | null;
  /** The split the member last accepted. */
  allocations: { mint: string; bps: string }[];
  /** When the member started following. */
  since: string;
}

export const MAX_FOLLOWED = 12;

/** A weight that differs, in basis points; 0 means the asset is not in that split. */
export interface SplitChange { mint: string; before: number; after: number }

/**
 * Every weight that differs between the accepted split and the author's current
 * one, largest move first; equal moves keep the author's order, then removals.
 */
export function splitChanges(before: readonly { mint: string; bps: string }[], after: readonly { mint: string; bps: string }[]): SplitChange[] {
  const weights = new Map<string, { before: number; after: number }>();
  for (const item of before) weights.set(item.mint, { before: Number(item.bps), after: 0 });
  for (const item of after) weights.set(item.mint, { before: weights.get(item.mint)?.before ?? 0, after: Number(item.bps) });
  const order = new Map<string, number>();
  for (const item of [...after, ...before]) if (!order.has(item.mint)) order.set(item.mint, order.size);
  return [...weights]
    .filter(([, weight]) => weight.before !== weight.after)
    .map(([mint, weight]) => ({ mint, ...weight }))
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || (order.get(a.mint) ?? 0) - (order.get(b.mint) ?? 0));
}

/** Start following, or accept the author's current split, as a new list: most recent first, capped. */
export function withFollowed(list: readonly FollowedPlan[], plan: Pick<GalleryPlan, 'id' | 'name' | 'display_name' | 'allocations'>, now: Date = new Date()): FollowedPlan[] {
  const existing = list.find(item => item.id === plan.id);
  const next: FollowedPlan = { id: plan.id, name: plan.name, displayName: plan.display_name, allocations: plan.allocations.map(item => ({ mint: item.mint, bps: item.bps })), since: existing?.since ?? now.toISOString() };
  return [next, ...list.filter(item => item.id !== plan.id)].slice(0, MAX_FOLLOWED);
}

export function withoutFollowed(list: readonly FollowedPlan[], id: string): FollowedPlan[] {
  return list.filter(item => item.id !== id);
}
