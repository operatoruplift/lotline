'use client';

import { useEffect, useRef } from 'react';
import { TURNSTILE_SCRIPT_URL } from '@/lib/supabase/captcha';
import styles from './auth.module.css';

type Turnstile = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
    'timeout-callback'?: () => void;
    theme?: 'light' | 'dark' | 'auto';
    size?: 'normal' | 'flexible' | 'compact';
  }) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window { turnstile?: Turnstile; lotlineTurnstileReady?: () => void }
}

const SCRIPT_FAILED = 'The verification script could not be loaded.';
let loading: Promise<Turnstile> | null = null;

/** Loads Cloudflare's script once per page. The Content-Security-Policy admits its origin only when the site key is set. */
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    window.lotlineTurnstileReady = () => { if (window.turnstile) resolve(window.turnstile); else reject(new Error(SCRIPT_FAILED)); };
    const script = document.createElement('script');
    script.src = `${TURNSTILE_SCRIPT_URL}?render=explicit&onload=lotlineTurnstileReady`;
    script.async = true;
    script.onerror = () => { loading = null; reject(new Error(SCRIPT_FAILED)); };
    document.head.append(script);
  });
  return loading;
}

/**
 * One Turnstile widget. Supabase Auth accepts each token once, so after every
 * attempt the parent raises `round` and the widget fetches a fresh token.
 * `onToken(null)` means there is no usable token right now.
 */
export function Captcha({ siteKey, round, onToken }: { siteKey: string; round: number; onToken: (token: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  useEffect(() => { report.current = onToken; }, [onToken]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    loadTurnstile().then(turnstile => {
      if (cancelled) return;
      widget.current = turnstile.render(element, {
        sitekey: siteKey,
        callback: token => report.current(token),
        'expired-callback': () => report.current(null),
        'error-callback': () => report.current(null),
        'timeout-callback': () => report.current(null),
        theme: 'light',
        size: 'flexible',
      });
    }).catch(() => { if (!cancelled) report.current(null); });
    return () => {
      cancelled = true;
      const id = widget.current;
      widget.current = null;
      if (id && window.turnstile) { try { window.turnstile.remove(id); } catch { /* the widget is already gone */ } }
    };
  }, [siteKey]);

  useEffect(() => {
    const id = widget.current;
    if (round === 0 || !id || !window.turnstile) return;
    report.current(null);
    try { window.turnstile.reset(id); } catch { /* a failed reset leaves the widget to show its own retry */ }
  }, [round]);

  return <div ref={container} className={styles.captcha} data-captcha="" />;
}
