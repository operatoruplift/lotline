'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMotion } from './motion-provider';
import { controlPlayback, shouldPlayDecorativeVideo } from '@/lib/media/playback';
import styles from './decorative-video.module.css';

function subscribeNetwork(notify: () => void) {
  window.addEventListener('online', notify); window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
}
const onlineSnapshot = () => navigator.onLine;
const offlineSnapshot = () => false;

export function DecorativeVideo({ src, mobileSrc, poster, label, className = '', priority = false, fit = 'cover' }: {
  src: string; mobileSrc?: string; poster: string; label: string; className?: string; priority?: boolean; fit?: 'cover' | 'contain';
}) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const sourceAssigned = useRef(false);
  const recoveryUsed = useRef(false);
  const recoverMedia = useRef<() => void>(() => {});
  const { motionAllowed } = useMotion();
  const online = useSyncExternalStore(subscribeNetwork, onlineSnapshot, offlineSnapshot);
  const [inView, setInView] = useState(false);
  const [nearView, setNearView] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const [failure, setFailure] = useState<'media' | 'playback' | null>(null);
  const failed = failure !== null;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    recoverMedia.current = () => {
      const node = video.current;
      const scene = container.current;
      if (!node || !scene || failure !== 'media' || recoveryUsed.current || !motionAllowed || !navigator.onLine || document.visibilityState === 'hidden' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bounds = scene.getBoundingClientRect();
      if (bounds.bottom < -280 || bounds.top > innerHeight + 280) return;
      // One retry after a real reconnect or viewport reentry, never a retry loop.
      recoveryUsed.current = true;
      setFailure(null);
      setSourceReady(false);
      setPlaying(false);
      node.load();
    };
    return () => { recoverMedia.current = () => {}; };
  }, [failure, motionAllowed]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let wasVisible = false;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      setInView(visible);
      if (visible && !wasVisible) recoverMedia.current();
      wasVisible = visible;
    }, { threshold: 0.01 });
    const preloadObserver = new IntersectionObserver(entries => setNearView(entries.some(entry => entry.isIntersecting)), { rootMargin: '280px 0px', threshold: 0 });
    observer.observe(node);
    preloadObserver.observe(node);
    const recoverOnline = () => recoverMedia.current();
    window.addEventListener('online', recoverOnline);
    return () => { observer.disconnect(); preloadObserver.disconnect(); window.removeEventListener('online', recoverOnline); };
  }, []);
  useEffect(() => {
    if (!motionAllowed || !online || !nearView || sourceReady || sourceAssigned.current) return;
    // Warm the next scene just before entry; playback still requires actual visibility.
    const node = video.current;
    if (!node) return;
    sourceAssigned.current = true;
    // Pick once for the first nearby scene; resizing never downloads both films.
    node.preload = 'auto';
    node.src = mobileSrc && window.matchMedia('(max-width: 700px)').matches ? mobileSrc : src;
    node.load();
  }, [motionAllowed, online, nearView, sourceReady, src, mobileSrc]);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    return controlPlayback(node, shouldPlayDecorativeVideo({ allowed: motionAllowed && online, inView, sourceReady, failed }), () => { setFailure('playback'); setPlaying(false); });
  }, [motionAllowed, online, inView, sourceReady, failed]);
  useEffect(() => {
    const node = video.current;
    return () => { if (node) { node.pause(); node.removeAttribute('src'); node.load(); } };
  }, []);
  return <div ref={container} className={`${styles.scene} ${className}`} data-decorative-video={label} data-playback={failed ? 'fallback' : playing && motionAllowed && online && inView ? 'playing' : 'paused'}>
    {/* A real still remains visible when motion is reduced, blocked, or unavailable. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.poster} src={poster} alt="" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'low'} decoding="async" style={{ objectFit: fit }} />
    <video ref={video} className={styles.video} muted playsInline loop preload="none" aria-hidden="true" tabIndex={-1} style={{ objectFit: fit, opacity: playing && !failed && motionAllowed && online ? 1 : 0 }} onLoadedData={() => setSourceReady(true)} onPlaying={() => setPlaying(true)} onError={() => { setFailure('media'); setPlaying(false); }} />
  </div>;
}
