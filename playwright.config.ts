import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  // The execution journeys are long multi-step walks. On a quiet machine the whole
  // file finishes in about 40 seconds, but a loaded shared runner has pushed a single
  // step past the limit and failed an otherwise healthy build, so the budget carries
  // headroom rather than sitting just above the happy path.
  timeout: 150_000,
  expect: { timeout: 15_000 },
  // A retry distinguishes a genuinely broken assertion, which fails every attempt,
  // from a runner that stalled for a moment. Retried tests are reported as flaky
  // rather than silently passed, so this surfaces instability instead of hiding it.
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  reporter: [['list']],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: !process.env.CI, timeout: 120_000,
  },
});
