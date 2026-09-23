'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMotion } from './motion-provider';
import styles from './reveal.module.css';

/** Progressively enhance visible server content with one short entrance near the viewport. */
export function Reveal({ children, className = '', delay = 0, effect = 'rise' }: { children: ReactNode; className?: string; delay?: number; effect?: 'rise' | 'blur' | 'footer' | 'fade' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const { ready, reducedMotion } = useMotion();
  const enhanced = ready && !reducedMotion && typeof IntersectionObserver !== 'undefined';
  useEffect(() => {
    const node = ref.current;
    if (!node || !enhanced || seen) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setSeen(true); observer.disconnect(); } }, { threshold: 0.01, rootMargin: '0px 0px 96px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enhanced, seen]);
  return <div ref={ref} data-reveal={effect} data-seen={seen} data-reveal-enhanced={enhanced} className={`${styles.reveal} ${styles[effect]} ${className}`} style={{ '--reveal-delay': `${Math.min(160, Math.max(0, delay))}ms` } as CSSProperties}>{children}</div>;
}
