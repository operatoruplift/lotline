'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './reveal.module.css';

/** Observe once. Pausing/resuming changes playback state, never the animation identity. */
export function Reveal({ children, className = '', delay = 0, effect = 'rise' }: { children: ReactNode; className?: string; delay?: number; effect?: 'rise' | 'blur' | 'footer' | 'fade' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setSeen(true); observer.disconnect(); } }, { threshold: 0.06 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} data-reveal={effect} data-seen={seen} className={`${styles.reveal} ${styles[effect]} ${className}`} style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}>{children}</div>;
}
