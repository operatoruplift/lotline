'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { useMotion } from './motion-provider';
import { GLASS_POSITION, glassGeometry, type GlassGeometry } from '@/lib/media/glass-geometry';
import { glassFramePump } from '@/lib/media/glass-frames';
import { createGlassRenderer, type GlassRenderer } from '@/lib/media/glass-renderer';
import styles from './liquid-glass.module.css';

const POSTER = '/media/design/auth-glass-poster.jpg';
type Controls = { setMotion: (allowed: boolean) => void; retry: () => void };

export function LiquidGlass({ children }: { children: ReactNode }) {
  const scene = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<Controls | null>(null);
  const revealed = useRef(false);
  const { motionAllowed, reducedMotion, ready } = useMotion();
  const [playback, setPlayback] = useState<'paused' | 'playing' | 'blocked' | 'unavailable'>('paused');

  useEffect(() => {
    const sceneNode = scene.current;
    const cardNode = card.current;
    const surfaceNode = surface.current;
    const media = video.current;
    if (!sceneNode || !cardNode || !surfaceNode || !media) return;
    // A fresh surface also makes StrictMode setup/cleanup release its old context.
    const canvas = document.createElement('canvas');
    const videoSource = window.matchMedia('(max-width: 700px)').matches ? '/media/design/auth-glass-mobile.mp4' : '/media/design/auth-glass.mp4';
    canvas.className = styles.canvas;
    surfaceNode.appendChild(canvas);
    let renderer: GlassRenderer | null = null;
    let geometry: GlassGeometry | null = null;
    let disposed = false;
    let visible = false;
    let allowed = false;
    let blocked = false;
    let mediaFailed = false;
    let graphicsFailed = false;
    let playRevision = 0;
    let playPending = false;
    let frames = 0;
    const poster = new Image();
    const canPlay = () => !disposed && allowed && visible && !document.hidden && !blocked && !mediaFailed;

    function graphicsFallback() {
      if (graphicsFailed) return;
      graphicsFailed = true;
      renderer?.dispose(); renderer = null;
      cardNode!.dataset.refractionState = 'fallback';
    }

    function paint() {
      if (disposed || !visible || document.hidden || !renderer) return;
      const decoded = media!.readyState >= 2 && !mediaFailed;
      const source = decoded ? media! : poster;
      const size = decoded ? { width: media!.videoWidth, height: media!.videoHeight } : { width: poster.naturalWidth, height: poster.naturalHeight };
      if (!size.width || !size.height) return;
      geometry ??= glassGeometry(sceneNode!.getBoundingClientRect(), cardNode!.getBoundingClientRect(), size);
      if (!geometry) return;
      try {
        renderer.draw(source, geometry, window.devicePixelRatio);
        cardNode!.dataset.refractionState = decoded ? media!.paused ? 'paused' : 'video' : 'poster';
        cardNode!.dataset.refractionFrames = String(++frames);
      } catch { graphicsFallback(); }
    }

    const pump = glassFramePump(media, { request: callback => window.requestAnimationFrame(callback), cancel: id => window.cancelAnimationFrame(id) }, paint);

    function synchronize() {
      if (disposed) return;
      if (!canPlay()) {
        playRevision += 1; playPending = false;
        media!.pause(); pump.stop();
        if (!blocked && !mediaFailed) setPlayback('paused');
        if (!graphicsFailed && cardNode!.dataset.refractionState === 'video') cardNode!.dataset.refractionState = 'paused';
        paint();
        return;
      }
      if (!media!.getAttribute('src')) {
        // Set CORS mode before assigning the same-origin, source-derived media.
        media!.crossOrigin = 'anonymous'; media!.src = videoSource; media!.load();
      }
      if (media!.readyState < 2 || playPending) return;
      if (!media!.paused) { pump.start(); return; }
      const revision = ++playRevision;
      playPending = true;
      const rejected = () => {
        if (disposed || revision !== playRevision) return;
        playPending = false; blocked = true; pump.stop();
        setPlayback('blocked'); paint();
      };
      try { void media!.play().then(() => {
        if (revision === playRevision) playPending = false;
        if (!canPlay()) media!.pause();
        else pump.start();
      }).catch(rejected); } catch { rejected(); }
    }

    const instance: Controls = {
      setMotion(next) { if (next && !allowed) blocked = false; allowed = next; synchronize(); },
      retry() { if (!mediaFailed) { blocked = false; synchronize(); } },
    };
    controls.current = instance;
    const resize = () => { geometry = null; paint(); };
    const loaded = () => { media!.dataset.decoded = 'true'; geometry = null; paint(); synchronize(); };
    const playing = () => { if (!canPlay()) { media!.pause(); return; } setPlayback('playing'); pump.start(); };
    const failed = () => { mediaFailed = true; playRevision += 1; media!.pause(); pump.stop(); delete media!.dataset.decoded; geometry = null; setPlayback('unavailable'); paint(); };
    const lost = (event: Event) => { event.preventDefault(); graphicsFallback(); };
    const focus = () => { cardNode.dataset.entrance = 'done'; revealed.current = true; };
    const entered = (event: AnimationEvent) => { if (event.target === cardNode.querySelector('[data-auth-reveal="last"]')) cardNode.dataset.entrance = 'done'; };
    media.addEventListener('loadeddata', loaded);
    media.addEventListener('playing', playing);
    media.addEventListener('error', failed);
    canvas.addEventListener('webglcontextlost', lost);
    cardNode.addEventListener('focusin', focus);
    cardNode.addEventListener('animationend', entered);
    document.addEventListener('visibilitychange', synchronize);
    window.addEventListener('resize', resize);
    const intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); synchronize(); }, { threshold: 0 });
    const sizes = new ResizeObserver(resize);
    intersection.observe(sceneNode); sizes.observe(sceneNode); sizes.observe(cardNode);
    try { renderer = createGlassRenderer(canvas); } catch { graphicsFallback(); }
    poster.onload = () => { geometry = null; paint(); };
    poster.onerror = () => { if (media.readyState < 2) graphicsFallback(); };
    poster.src = POSTER;

    return () => {
      disposed = true; playRevision += 1; pump.stop();
      intersection.disconnect(); sizes.disconnect();
      media.removeEventListener('loadeddata', loaded); media.removeEventListener('playing', playing); media.removeEventListener('error', failed);
      canvas.removeEventListener('webglcontextlost', lost);
      cardNode.removeEventListener('focusin', focus); cardNode.removeEventListener('animationend', entered);
      document.removeEventListener('visibilitychange', synchronize); window.removeEventListener('resize', resize);
      poster.onload = null; poster.onerror = null; poster.src = '';
      media.pause(); media.removeAttribute('src'); media.load();
      renderer?.dispose(); canvas.remove();
      if (controls.current === instance) controls.current = null;
    };
  }, []);

  useEffect(() => {
    controls.current?.setMotion(ready && motionAllowed);
    const node = card.current;
    if (!ready || !node) return;
    if (!revealed.current) {
      revealed.current = true;
      node.dataset.entrance = motionAllowed && !node.contains(document.activeElement) ? 'enter' : 'done';
    } else if (!motionAllowed) node.dataset.entrance = 'done';
  }, [ready, motionAllowed]);

  return <div ref={scene} className={styles.scene} data-glass-scene data-playback={playback}>
    <div className={styles.backdrop} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.poster} src={POSTER} alt="" decoding="async" />
      <video ref={video} className={styles.video} muted playsInline loop preload="none" tabIndex={-1} style={{ objectPosition: `${GLASS_POSITION.x * 100}% ${GLASS_POSITION.y * 100}%` }} />
    </div>
    <div ref={card} className={styles.card} data-glass-card data-refraction-state="loading">
      <div className={styles.fallback} aria-hidden="true" />
      <div ref={surface} className={styles.surface} aria-hidden="true" />
      <div className={styles.veil} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </div>
    <div className={styles.sceneFooter}><span>A little clarity. A fresh perspective.</span>{playback === 'blocked' && <button type="button" onClick={() => controls.current?.retry()}><Play size={14} aria-hidden="true" />Play background</button>}{reducedMotion && ready && <span>Still scene for reduced motion</span>}{playback === 'unavailable' && <span>Still scene</span>}</div>
  </div>;
}
