import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  reporter: [['list']],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: !process.env.CI, timeout: 120_000,
  },
});
