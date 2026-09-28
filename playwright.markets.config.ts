import { defineConfig, devices } from '@playwright/test';

/**
 * Markets ship behind LOTLINE_MARKETS_ENABLED. This suite runs against a
 * separate production server started with the flag on, so the main suite keeps
 * proving the judged interface is unchanged with the flag off. Build first.
 */
export default defineConfig({
  testDir: './tests/e2e-markets',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: process.env.E2E_MARKETS_BASE_URL ?? 'http://127.0.0.1:3102', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  reporter: [['list']],
  webServer: process.env.E2E_MARKETS_BASE_URL ? undefined : {
    command: 'npm run start -- --port 3102 --hostname 127.0.0.1', url: 'http://127.0.0.1:3102', reuseExistingServer: false, timeout: 120_000,
    env: { LOTLINE_MARKETS_ENABLED: 'true', LOTLINE_GALLERY_ENABLED: 'true' },
  },
});
