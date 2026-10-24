'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { hasSessionCookie } from '@/lib/client/session-cookie';

/** Re-read when the tab regains focus or is restored, which is when a sign-in or sign-out elsewhere shows up. */
function subscribe(onChange: () => void) {
  window.addEventListener('focus', onChange);
  window.addEventListener('pageshow', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    window.removeEventListener('pageshow', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}
const readCookie = () => hasSessionCookie(document.cookie);
const serverSnapshot = () => false;

/**
 * The header's link to /sign-in: "Account" once this browser holds a session
 * cookie, "Sign in" otherwise. Read on the client so static pages stay static;
 * the account page itself still checks the session with Auth.
 */
export function AccountLink({ className, current = false }: { className: string; current?: boolean }) {
  const signedIn = useSyncExternalStore(subscribe, readCookie, serverSnapshot);
  return <Link href="/sign-in" className={className} aria-current={current ? 'page' : undefined}>{signedIn ? 'Account' : 'Sign in'}</Link>;
}
