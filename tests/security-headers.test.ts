import { afterEach, expect, it, vi } from 'vitest';
import config from '../next.config';

afterEach(() => vi.unstubAllEnvs());
it('permits the development compiler without weakening production CSP', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const dev = await config.headers!();
  expect(dev.find(route => route.source === '/:path*')?.headers.find(header => header.key === 'Content-Security-Policy')?.value).toContain("'unsafe-eval'");
  vi.stubEnv('NODE_ENV', 'production');
  const production = await config.headers!();
  expect(production.find(route => route.source === '/:path*')?.headers.find(header => header.key === 'Content-Security-Policy')?.value).not.toContain("'unsafe-eval'");
  expect(production.find(route => route.source === '/sw.js')?.headers.find(header => header.key === 'Content-Security-Policy')?.value).toBe("default-src 'self'; script-src 'self'");
});

it('admits Cloudflare Turnstile for scripts and frames only while the CAPTCHA site key is set', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const policy = async () => (await config.headers!()).find(route => route.source === '/:path*')?.headers.find(header => header.key === 'Content-Security-Policy')?.value ?? '';
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY', '');
  expect(await policy()).not.toContain('challenges.cloudflare.com');
  expect(await policy()).not.toContain('frame-src');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY', 'not a key');
  expect(await policy()).not.toContain('challenges.cloudflare.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY', '0x4AAAAAAAExampleSiteKey');
  const withKey = await policy();
  expect(withKey).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
  expect(withKey).toContain('frame-src https://challenges.cloudflare.com');
  expect(withKey).not.toContain("'unsafe-eval'");
});
