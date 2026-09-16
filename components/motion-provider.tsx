'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

function snapshot() {
  return `${window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0}${document.visibilityState === 'hidden' ? 0 : 1}`;
}
function subscribe(notify: () => void) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', notify);
  document.addEventListener('visibilitychange', notify);
  window.addEventListener('storage', notify);
  return () => {
    preference.removeEventListener('change', notify);
    document.removeEventListener('visibilitychange', notify);
    window.removeEventListener('storage', notify);
  };
}
const serverSnapshot = () => 'server';
const MotionContext = createContext({ motionAllowed: false, reducedMotion: true, ready: false });

export function MotionProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const ready = state !== 'server';
  const reducedMotion = !ready || state[0] === '1';
  const visible = ready && state[1] === '1';
  const motionAllowed = ready && !reducedMotion && visible;
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : !visible ? 'hidden' : 'running';
    return () => { delete document.documentElement.dataset.motion; };
  }, [reducedMotion, visible]);
  const value = useMemo(() => ({ motionAllowed, reducedMotion, ready }), [motionAllowed, reducedMotion, ready]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion() { return useContext(MotionContext); }
