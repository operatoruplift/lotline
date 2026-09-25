'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMotion } from './motion-provider';
import styles from './reveal.module.css';

/** Progressively enhance visible server content with one short entrance near the viewport. */
export function Reveal({ children, className = '', delay = 0, effect = 'rise' }: { children: ReactNode; className?: string; delay?: number; effect?: 'rise' | 'blur' | 'footer' | 'fade' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [complete, setComplete] = useState(false);
  const { ready, reducedMotion } = useMotion();
  const enhanced = ready && !reducedMotion && !complete && typeof IntersectionObserver !== 'undefined';
  useEffect(() => {
    const node = ref.current;
    if (!node || !ready || complete || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setSeen(true);
        // Content read with reduced motion should stay visible when motion returns.
        if (reducedMotion) setComplete(true);
        observer.disconnect();
      }
    }, { threshold: 0.01, rootMargin: '0px 0px 96px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, reducedMotion, complete]);
  return <div ref={ref} data-reveal={effect} data-seen={seen} data-reveal-enhanced={enhanced} className={`${styles.reveal} ${styles[effect]} ${className}`} style={{ '--reveal-delay': `${Math.min(160, Math.max(0, delay))}ms` } as CSSProperties}
    onFocusCapture={() => { setSeen(true); setComplete(true); }}
    onAnimationEnd={event => { if (event.target === event.currentTarget) setComplete(true); }}
  >{children}</div>;
}
