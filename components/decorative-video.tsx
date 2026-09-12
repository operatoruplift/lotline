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
  const { motionAllowed } = useMotion();
  const online = useSyncExternalStore(subscribeNetwork, onlineSnapshot, offlineSnapshot);
  const [inView, setInView] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)), { threshold: 0.01 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!motionAllowed || !online || !inView || sourceReady || sourceAssigned.current) return;
    // Assign the source only when the scene is visible and motion is allowed.
    const node = video.current;
    if (!node) return;
    sourceAssigned.current = true;
    // Pick once for the first visible playback; resizing never downloads both films.
    node.src = mobileSrc && window.matchMedia('(max-width: 700px)').matches ? mobileSrc : src;
    node.load();
  }, [motionAllowed, online, inView, sourceReady, src, mobileSrc]);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    return controlPlayback(node, shouldPlayDecorativeVideo({ allowed: motionAllowed && online, inView, sourceReady, failed }), () => { setFailed(true); setPlaying(false); });
  }, [motionAllowed, online, inView, sourceReady, failed]);
  useEffect(() => {
    const node = video.current;
    return () => { if (node) { node.pause(); node.removeAttribute('src'); node.load(); } };
  }, []);
  return <div ref={container} className={`${styles.scene} ${className}`} data-decorative-video={label} data-playback={failed ? 'fallback' : playing && motionAllowed && online && inView ? 'playing' : 'paused'}>
    {/* A real still remains visible when motion is reduced, blocked, or unavailable. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.poster} src={poster} alt="" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'low'} decoding="async" style={{ objectFit: fit }} />
    <video ref={video} className={styles.video} muted playsInline loop preload="none" aria-hidden="true" tabIndex={-1} style={{ objectFit: fit, opacity: playing && !failed ? 1 : 0 }} onLoadedData={() => setSourceReady(true)} onPlaying={() => setPlaying(true)} onError={() => { setFailed(true); setPlaying(false); }} />
  </div>;
}
