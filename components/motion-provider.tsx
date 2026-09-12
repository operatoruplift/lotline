'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './motion.module.css';

const STORAGE_KEY = 'lotline:motion:paused:v1';
const CHANGE_EVENT = 'lotline-motion-preference';
let memoryPaused = false;
let storageWritable = true;

function readPaused() {
  if (!storageWritable) return memoryPaused;
  try { return window.localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return memoryPaused; }
}

function snapshot() {
  return `${window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0}${readPaused() ? 1 : 0}${document.visibilityState === 'hidden' ? 0 : 1}`;
}
function subscribe(notify: () => void) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', notify);
  document.addEventListener('visibilitychange', notify);
  window.addEventListener('storage', notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    preference.removeEventListener('change', notify);
    document.removeEventListener('visibilitychange', notify);
    window.removeEventListener('storage', notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}
const serverSnapshot = () => 'server';
const MotionContext = createContext({ motionAllowed: false, paused: false, reducedMotion: true, ready: false, togglePause: () => {} });

export function MotionProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const ready = state !== 'server';
  const reducedMotion = !ready || state[0] === '1';
  const paused = ready && state[1] === '1';
  const visible = ready && state[2] === '1';
  const motionAllowed = ready && !reducedMotion && !paused && visible;
  const togglePause = useCallback(() => {
    memoryPaused = !readPaused();
    try { window.localStorage.setItem(STORAGE_KEY, String(memoryPaused)); } catch { storageWritable = false; }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : paused ? 'paused' : !visible ? 'hidden' : 'running';
    return () => { delete document.documentElement.dataset.motion; };
  }, [reducedMotion, paused, visible]);
  const value = useMemo(() => ({ motionAllowed, paused, reducedMotion, ready, togglePause }), [motionAllowed, paused, reducedMotion, ready, togglePause]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion() { return useContext(MotionContext); }

export function MotionToggle() {
  const { paused, reducedMotion, ready, togglePause } = useMotion();
  const label = reducedMotion && ready ? 'Motion reduced by your device setting' : paused ? 'Resume motion' : 'Pause motion';
  return <button type="button" className={styles.toggle} onClick={togglePause} disabled={!ready || reducedMotion} aria-label={label} title={label} aria-pressed={paused}>
    {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
    <span>{ready && reducedMotion ? 'Reduced motion' : paused ? 'Motion paused' : 'Pause motion'}</span>
  </button>;
}
