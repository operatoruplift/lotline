import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSessionCookie, sessionCookieName } from '../lib/client/session-cookie';

afterEach(() => vi.unstubAllEnvs());

describe('session cookie hint', () => {
  it('names the cookie after the project reference, as @supabase/ssr does', () => {
    expect(sessionCookieName('https://uemunksopacicpbjubtg.supabase.co')).toBe('sb-uemunksopacicpbjubtg-auth-token');
    expect(sessionCookieName('https://auth-fixture.invalid')).toBe('sb-auth-fixture-auth-token');
    expect(sessionCookieName('not a url')).toBeNull();
  });

  it('sees a whole or chunked session cookie and ignores everything else', () => {
    const url = 'https://auth-fixture.invalid';
    expect(hasSessionCookie('sb-auth-fixture-auth-token=base64-eyJ', url)).toBe(true);
    expect(hasSessionCookie('theme=dark; sb-auth-fixture-auth-token.0=base64-eyJ; sb-auth-fixture-auth-token.1=abc', url)).toBe(true);
    expect(hasSessionCookie('sb-auth-fixture-auth-token=', url)).toBe(false);
    expect(hasSessionCookie('sb-auth-fixture-auth-token-code-verifier=pkce', url)).toBe(false);
    expect(hasSessionCookie('sb-other-auth-token=base64-eyJ; theme=dark', url)).toBe(false);
    expect(hasSessionCookie('', url)).toBe(false);
  });

  it('is never signed in without a configured project', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect(hasSessionCookie('sb-auth-fixture-auth-token=base64-eyJ')).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth-fixture.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
    expect(hasSessionCookie('sb-auth-fixture-auth-token=base64-eyJ')).toBe(true);
  });
});
