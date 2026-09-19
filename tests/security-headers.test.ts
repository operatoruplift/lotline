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
