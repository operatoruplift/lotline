import { afterEach, describe, expect, it, vi } from 'vitest';
import { captchaSiteKey, TURNSTILE_ORIGIN, TURNSTILE_SCRIPT_URL } from '../lib/supabase/captcha';

afterEach(() => vi.unstubAllEnvs());

describe('CAPTCHA site key', () => {
  it('is the configured Turnstile site key, trimmed, when it looks like one', () => {
    expect(captchaSiteKey('0x4AAAAAAAExampleSiteKey')).toBe('0x4AAAAAAAExampleSiteKey');
    expect(captchaSiteKey('  1x00000000000000000000AA  ')).toBe('1x00000000000000000000AA');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY', '2x00000000000000000000AB');
    expect(captchaSiteKey()).toBe('2x00000000000000000000AB');
  });

  it('stays off without a key or with something that is not one', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY', '');
    expect(captchaSiteKey()).toBeNull();
    for (const value of [undefined, '', '   ', 'not a key', '<script>', 'a'.repeat(101), 'https://challenges.cloudflare.com']) expect(captchaSiteKey(value), String(value)).toBeNull();
  });

  it('loads the script from the one origin the policy admits', () => {
    expect(TURNSTILE_SCRIPT_URL).toBe(`${TURNSTILE_ORIGIN}/turnstile/v0/api.js`);
    expect(TURNSTILE_ORIGIN).toBe('https://challenges.cloudflare.com');
  });
});
