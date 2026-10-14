'use client';

import { useEffect, useState } from 'react';
import { accountUserSchema, type AccountUser } from '@/lib/client/account';

/**
 * The member signed in on this browser, checked with the server. Null while
 * checking and for a guest, so a guest's page never changes.
 */
export function useSignedInAccount(enabled: boolean) {
  const [user, setUser] = useState<AccountUser | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(response => response.ok ? response.json() : null)
      .then((body: { state?: string; user?: unknown } | null) => {
        const parsed = accountUserSchema.safeParse(body?.user);
        if (!controller.signal.aborted && body?.state === 'signed-in' && parsed.success) setUser(parsed.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled]);
  return [user, setUser] as const;
}
