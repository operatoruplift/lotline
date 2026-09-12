import { devices, expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('installation instructions are accessible on mobile and desktop', async ({ page }) => {
  await page.goto('/');
  const install = page.getByRole('button', { name: 'Install Lotline', exact: true });
  await install.click();
  await expect(page.getByRole('heading', { name: 'Keep Lotline on your device' })).toBeVisible();
  await expect(install).toHaveAttribute('aria-expanded', 'true');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Close instructions' }).click();
  await expect(install).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('uses the browser install prompt and hides install UI after installation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Install Lotline', exact: true }).waitFor();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Install Lotline', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Installation accepted' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('button', { name: 'Install Lotline', exact: true })).toHaveCount(0);
});

test('iPhone viewport explains Safari installation without pretending to install', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Install Lotline', exact: true }).click();
    await expect(page.getByText(/On iPhone or iPad, open this site in Safari/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  } finally { await context.close(); }
});

test('blocked offline setup reports unavailable instead of claiming cached readiness', async ({ page }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Service-worker setup is enabled only in a production build.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'register', {
      value: () => Promise.reject(new DOMException('Storage is blocked by browser settings.', 'SecurityError')),
      configurable: true,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Install Lotline', exact: true }).click();
  await expect(page.getByText(/Offline storage is not ready/)).toBeVisible();
  await expect(page.getByText('The Example is ready to use offline on this device.')).toHaveCount(0);
});

test('offline reload supports real Example math and export without caching live or account data', async ({ page, context }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Service workers run in production; set E2E_BASE_URL to a production build.');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app?mode=example');
  await expect(page.getByLabel('USDC budget')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/offline'))), { timeout: 30_000 }).toBe(true);
  await page.getByRole('button', { name: 'Install Lotline', exact: true }).click();
  await expect(page.getByText('The Example is ready to use offline on this device.')).toBeVisible();
  await page.getByRole('button', { name: 'Close instructions' }).click();
  // Exercise ordinary data endpoints before checking that no responses are kept.
  await page.evaluate(async () => { await fetch('/api/assets'); });
  const cachedUrls = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('lotline-'));
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat();
  });
  expect(cachedUrls.every(url => {
    const path = new URL(url).pathname;
    return path === '/offline' || path.startsWith('/_next/static/') || path.startsWith('/brand/') || path.startsWith('/icons/') || path.startsWith('/logos/');
  })).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('USDC budget')).toBeVisible();
  await expect(page.getByText('You’re offline. Live estimates and sync are paused.')).toBeVisible();
  await page.getByLabel('USDC budget').fill('10.000001');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const file = await (await downloaded).path();
  const csv = await readFile(file!, 'utf8');
  expect(csv).toContain('5.000001');
  expect(csv).toContain('3.000000');
  expect(csv).toContain('2.000000');
  expect(csv.toLowerCase()).toContain('example');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
