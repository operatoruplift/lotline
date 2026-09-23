'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useMotion } from './motion-provider';
import styles from './landing-motion.module.css';

/** Native scroll drives shallow decorative layers; it never moves the viewport. */
export function LandingMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { motionAllowed } = useMotion();

  useEffect(() => {
    const root = ref.current;
    if (!root || !motionAllowed) return;
    const scenes = [...root.querySelectorAll<HTMLElement>('[data-scroll-scene]')].map(node => ({
      node,
      layers: [...node.querySelectorAll<HTMLElement>('[data-scroll-layer]')]
        .filter(layer => layer.closest('[data-scroll-scene]') === node)
        .map(node => ({ node, depth: Number(node.dataset.scrollLayer) || 0 })),
    }));
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = window.innerHeight;
      const strength = window.innerWidth <= 800 ? 0.35 : 1;
      // Read every scene before writing transforms to avoid layout thrashing.
      const positions = scenes.map(scene => {
        const rect = scene.node.getBoundingClientRect();
        return Math.max(-1, Math.min(1, (height - rect.top * 2 - rect.height) / (height + rect.height)));
      });
      scenes.forEach((scene, index) => {
        scene.layers.forEach(layer => {
          layer.node.style.setProperty('--scroll-y', `${(positions[index] * layer.depth * strength).toFixed(2)}px`);
        });
      });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resize.disconnect();
      scenes.forEach(scene => scene.layers.forEach(layer => layer.node.style.removeProperty('--scroll-y')));
    };
  }, [motionAllowed]);

  return <div ref={ref} className={styles.root} data-landing-motion>{children}</div>;
}
