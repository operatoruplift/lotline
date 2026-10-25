import { describe, expect, it } from 'vitest';
import { authenticatedWithin, lastAuthenticatedAt, REAUTH_WINDOW_SECONDS } from '../lib/server/session-freshness';

const NOW = Date.parse('2026-10-24T09:00:00.000Z');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** An unsigned token with the payload under test: the route reads a claim, Auth did the verifying. */
const token = (claims: Record<string, unknown>) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.${encode('signature')}`;
const at = (secondsAgo: number) => Math.floor(NOW / 1_000) - secondsAgo;

describe('session freshness', () => {
  it('reads the latest authentication time from the amr claims', () => {
    expect(lastAuthenticatedAt(token({ amr: [{ method: 'password', timestamp: at(30) }] }))).toBe(at(30));
    expect(lastAuthenticatedAt(token({ amr: [{ method: 'password', timestamp: at(3_600) }, { method: 'web3', timestamp: at(20) }] }))).toBe(at(20));
    expect(lastAuthenticatedAt(token({ amr: [{ method: 'password', timestamp: at(30) }, { method: 'otp' }, 'junk', null] }))).toBe(at(30));
  });

  it('treats a token without a readable claim as never authenticated', () => {
    for (const value of ['', 'not-a-token', 'a.b', `${encode({})}.not-base64-json.sig`, token({}), token({ amr: [] }), token({ amr: 'password' }), token({ amr: [{ method: 'password', timestamp: '123' }] }), token({ amr: [{ timestamp: -5 }] }), 'x'.repeat(20_000)]) {
      expect(lastAuthenticatedAt(value), value.slice(0, 40)).toBeNull();
      expect(authenticatedWithin(value, REAUTH_WINDOW_SECONDS, NOW)).toBe(false);
    }
  });

  it('accepts a sign-in inside the window and refuses one outside it, whatever the token issue time', () => {
    expect(REAUTH_WINDOW_SECONDS).toBe(600);
    const fresh = token({ iat: at(5), amr: [{ method: 'password', timestamp: at(599) }] });
    const stale = token({ iat: at(5), amr: [{ method: 'password', timestamp: at(601) }] });
    expect(authenticatedWithin(fresh, REAUTH_WINDOW_SECONDS, NOW)).toBe(true);
    expect(authenticatedWithin(stale, REAUTH_WINDOW_SECONDS, NOW)).toBe(false);
    // A refreshed token repeats the old sign-in time; a new sign-in adds a newer entry.
    expect(authenticatedWithin(token({ iat: at(1), amr: [{ method: 'password', timestamp: at(7_200) }] }), REAUTH_WINDOW_SECONDS, NOW)).toBe(false);
    expect(authenticatedWithin(token({ amr: [{ method: 'password', timestamp: at(7_200) }, { method: 'web3', timestamp: at(60) }] }), REAUTH_WINDOW_SECONDS, NOW)).toBe(true);
    // A time slightly ahead of this clock is skew; far ahead is not believed.
    expect(authenticatedWithin(token({ amr: [{ method: 'password', timestamp: at(-30) }] }), REAUTH_WINDOW_SECONDS, NOW)).toBe(true);
    expect(authenticatedWithin(token({ amr: [{ method: 'password', timestamp: at(-3_600) }] }), REAUTH_WINDOW_SECONDS, NOW)).toBe(false);
  });
});
