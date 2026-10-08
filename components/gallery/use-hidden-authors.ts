'use client';

import { useEffect, useState } from 'react';
import { HIDDEN_AUTHORS_EVENT, HIDDEN_AUTHORS_STORAGE_KEY, readHiddenAuthors } from '@/lib/client/hidden-authors';
import type { HiddenAuthor } from '@/lib/domain/hidden-authors';

/** The authors hidden on this device, kept in step across components and tabs. Null until first read. */
export function useHiddenAuthors(): HiddenAuthor[] | null {
  const [list, setList] = useState<HiddenAuthor[] | null>(null);
  useEffect(() => {
    const read = () => { try { setList(readHiddenAuthors(window.localStorage)); } catch { setList([]); } };
    queueMicrotask(read);
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === HIDDEN_AUTHORS_STORAGE_KEY) read(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(HIDDEN_AUTHORS_EVENT, read);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(HIDDEN_AUTHORS_EVENT, read); };
  }, []);
  return list;
}
