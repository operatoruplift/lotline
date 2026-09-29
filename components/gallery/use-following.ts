'use client';

import { useEffect, useState } from 'react';
import { FOLLOWING_EVENT, FOLLOWING_STORAGE_KEY, readFollowing } from '@/lib/client/following';
import type { FollowedPlan } from '@/lib/domain/following';

/** This device's followed plans, kept in step across components and tabs. Null until first read. */
export function useFollowing(): FollowedPlan[] | null {
  const [list, setList] = useState<FollowedPlan[] | null>(null);
  useEffect(() => {
    const read = () => { try { setList(readFollowing(window.localStorage)); } catch { setList([]); } };
    queueMicrotask(read);
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === FOLLOWING_STORAGE_KEY) read(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(FOLLOWING_EVENT, read);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(FOLLOWING_EVENT, read); };
  }, []);
  return list;
}
