import { z } from 'zod';
import { MAX_HIDDEN_AUTHORS, withHiddenAuthor, withoutHiddenAuthor, type HiddenAuthor } from '@/lib/domain/hidden-authors';

export const HIDDEN_AUTHORS_STORAGE_KEY = 'lotline:hidden-authors:v1';
/** Fired on this page after a change; other tabs hear the storage event. */
export const HIDDEN_AUTHORS_EVENT = 'lotline:hidden-authors';

const hiddenSchema = z.array(z.object({
  key: z.string().regex(/^[a-f0-9]{24}$/),
  name: z.string().min(2).max(32).nullable(),
  since: z.string().refine(value => Number.isFinite(Date.parse(value))),
}).strict()).max(MAX_HIDDEN_AUTHORS);

/** The authors hidden on this device. Corrupt or blocked storage reads as none. */
export function readHiddenAuthors(storage: Pick<Storage, 'getItem'>): HiddenAuthor[] {
  try {
    const parsed = hiddenSchema.safeParse(JSON.parse(storage.getItem(HIDDEN_AUTHORS_STORAGE_KEY) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

/** Saves the list and tells this page. Returns false when storage refuses the write. */
export function writeHiddenAuthors(storage: Pick<Storage, 'setItem'>, list: readonly HiddenAuthor[]): boolean {
  try {
    storage.setItem(HIDDEN_AUTHORS_STORAGE_KEY, JSON.stringify(list));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(HIDDEN_AUTHORS_EVENT));
    return true;
  } catch { return false; }
}

function change(update: (list: HiddenAuthor[]) => HiddenAuthor[]): boolean {
  try { const storage = window.localStorage; return writeHiddenAuthors(storage, update(readHiddenAuthors(storage))); } catch { return false; }
}

export function hideAuthorOnDevice(author: { author_key: string; display_name: string | null }): boolean {
  return change(list => withHiddenAuthor(list, author));
}

export function showAuthorOnDevice(key: string): boolean {
  return change(list => withoutHiddenAuthor(list, key));
}
