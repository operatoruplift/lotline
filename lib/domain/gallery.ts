import { z } from 'zod';
import { XSTOCK_MINTS } from './assets';
import { CRYPTO_MINTS } from './crypto-assets';
import type { Basket } from './types';

/**
 * Community plans: names and splits members chose to share. They are shown
 * ranked by copies or recency, never by returns, and never with a budget,
 * an owner, a wallet or a balance.
 */
export const GALLERY_SORTS = ['copies', 'recent'] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number];
export const GALLERY_PAGE_SIZE = 24;
export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9.]$/;

const knownMints = new Set<string>([...XSTOCK_MINTS, ...CRYPTO_MINTS]);
const allocation = z.object({ mint: z.string().refine(value => knownMints.has(value)), bps: z.string().regex(/^(0|[1-9]\d{0,4})$/) }).strict();
export const galleryPlanSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60),
  display_name: z.string().min(2).max(32).nullable(),
  allocations: z.array(allocation).min(1).max(10)
    .refine(items => new Set(items.map(item => item.mint)).size === items.length)
    .refine(items => items.reduce((sum, item) => sum + Number(item.bps), 0) === 10_000),
  copy_count: z.number().int().min(0),
  published_at: z.string().refine(value => Number.isFinite(Date.parse(value))),
  // When the author last pointed the share at a newer split; absent or null until then.
  split_updated_at: z.string().refine(value => Number.isFinite(Date.parse(value))).nullable().optional(),
}).strict();
export type GalleryPlan = z.infer<typeof galleryPlanSchema>;
export type GalleryResponse = { state: 'success'; plans: GalleryPlan[]; sort: GallerySort; page: number; hasMore: boolean } | { state: 'unavailable' | 'configuration-required'; message: string };

/** A shared plan opened in the planner keeps the reader's own budget. */
export function galleryPlanToBasket(plan: Pick<GalleryPlan, 'allocations'>, budget = '1000'): Basket {
  return { version: 1, budget, items: plan.allocations.map(item => {
    const bps = Number(item.bps);
    const fraction = bps % 100;
    return { mint: item.mint, percent: fraction ? `${Math.floor(bps / 100)}.${String(fraction).padStart(2, '0').replace(/0$/, '')}` : String(Math.floor(bps / 100)) };
  }) };
}

/** The largest weights first, with how many more remain. */
export function leadingWeights(plan: Pick<GalleryPlan, 'allocations'>, count = 3): { shown: { mint: string; bps: number }[]; more: number } {
  const sorted = plan.allocations.map(item => ({ mint: item.mint, bps: Number(item.bps) })).sort((a, b) => b.bps - a.bps || a.mint.localeCompare(b.mint));
  return { shown: sorted.slice(0, count), more: Math.max(0, sorted.length - count) };
}
