import 'server-only';

/** Deleting an account needs a sign-in no older than this. */
export const REAUTH_WINDOW_SECONDS = 10 * 60;
/** Clock skew tolerated before a claimed sign-in time is in the future. */
const FUTURE_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 16_384;

/**
 * When the session last authenticated, in seconds since the epoch, read from
 * the access token's `amr` claims: Supabase Auth records one entry per method
 * with the time it was used, and a refreshed token keeps them. The token is not
 * verified here, since getUser has already validated the session with Auth;
 * this only reads a timestamp from it. Null when there is no readable claim,
 * which callers treat as "not recent".
 */
export function lastAuthenticatedAt(accessToken: string): number | null {
  if (accessToken.length > MAX_TOKEN_LENGTH) return null;
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { amr?: unknown };
    if (!Array.isArray(claims.amr)) return null;
    const times = claims.amr
      .map(entry => (entry && typeof entry === 'object' ? (entry as { timestamp?: unknown }).timestamp : undefined))
      .filter((time): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0);
    return times.length ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

/** True when the token's own claims say the session authenticated within the window. */
export function authenticatedWithin(accessToken: string, windowSeconds: number, nowMs = Date.now()): boolean {
  const at = lastAuthenticatedAt(accessToken);
  if (at === null) return false;
  const now = nowMs / 1_000;
  return now - at <= windowSeconds && at - now <= FUTURE_SKEW_SECONDS;
}
