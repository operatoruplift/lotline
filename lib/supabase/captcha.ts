/**
 * Cloudflare Turnstile in front of every Supabase sign-in, sign-up, recovery
 * and wallet grant. It is switched on by NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY
 * at build time: without the key no script loads, no widget renders and no
 * token is sent, so the forms are exactly as before. docs/accounts.md has the
 * Supabase dashboard step that makes Auth require the token, and the order to
 * do it in.
 */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js`;
// Turnstile site keys are short URL-safe tokens; anything else is a misconfiguration, not a key.
const SITE_KEY = /^[0-9A-Za-z_-]{1,100}$/;

/** The Turnstile site key when it is set and looks like one; otherwise null, and CAPTCHA stays off. */
export function captchaSiteKey(value: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY): string | null {
  const key = value?.trim();
  return key && SITE_KEY.test(key) ? key : null;
}
