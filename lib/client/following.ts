import { z } from 'zod';
import { MAX_FOLLOWED, withFollowed, withoutFollowed, type FollowedPlan } from '@/lib/domain/following';
import type { GalleryPlan } from '@/lib/domain/gallery';

export const FOLLOWING_STORAGE_KEY = 'lotline:following:v1';
/** Fired on this page after a change; other tabs hear the storage event. */
export const FOLLOWING_EVENT = 'lotline:following';

const followedSchema = z.array(z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60),
  displayName: z.string().min(2).max(32).nullable(),
  allocations: z.array(z.object({ mint: z.string().min(32).max(44), bps: z.string().regex(/^(0|[1-9]\d{0,4})$/) }).strict()).min(1).max(10),
  since: z.string().refine(value => Number.isFinite(Date.parse(value))),
}).strict()).max(MAX_FOLLOWED);

/** The plans this device follows. Corrupt or blocked storage reads as none. */
export function readFollowing(storage: Pick<Storage, 'getItem'>): FollowedPlan[] {
  try {
    const parsed = followedSchema.safeParse(JSON.parse(storage.getItem(FOLLOWING_STORAGE_KEY) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

/** Saves the list and tells this page. Returns false when storage refuses the write. */
export function writeFollowing(storage: Pick<Storage, 'setItem'>, list: readonly FollowedPlan[]): boolean {
  try {
    storage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(list));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(FOLLOWING_EVENT));
    return true;
  } catch { return false; }
}

function change(update: (list: FollowedPlan[]) => FollowedPlan[]): boolean {
  try { const storage = window.localStorage; return writeFollowing(storage, update(readFollowing(storage))); } catch { return false; }
}

/** Follow a shared plan on this device, or accept its current split. */
export function followOnDevice(plan: Pick<GalleryPlan, 'id' | 'name' | 'display_name' | 'allocations'>): boolean {
  return change(list => withFollowed(list, plan));
}

export function unfollowOnDevice(id: string): boolean {
  return change(list => withoutFollowed(list, id));
}
