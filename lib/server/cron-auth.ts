import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Vercel calls a scheduled route with `Authorization: Bearer <CRON_SECRET>`
 * when that variable is set. Both sides are hashed before the comparison, so it
 * takes the same time whatever the lengths and contents, and a missing secret
 * refuses every call rather than matching an empty one.
 */
export type CronAccess = 'ok' | 'unconfigured' | 'denied';

export function cronAccess(request: Request, secret: string | undefined = process.env.CRON_SECRET): CronAccess {
  const expected = secret?.trim();
  if (!expected) return 'unconfigured';
  const given = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected)) ? 'ok' : 'denied';
}
