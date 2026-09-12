import { expect, test } from '@playwright/test';
import { DEFAULT_BASKET } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';

test('restores an existing draft and preserves edits when reloaded before any timer runs', async ({ page }) => {
  const previousDraft = { ...DEFAULT_BASKET, budget: '125.75' };
  await page.addInitScript(({ key, draft }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(draft));
  }, { key: BASKET_STORAGE_KEY, draft: previousDraft });
  await page.clock.install({ time: new Date('2026-09-11T12:00:00Z') });
  await page.goto('/app?mode=example');
  await expect(page.getByLabel('USDC budget')).toHaveValue('125.75');
  await expect(page.getByText('Draft saved here', { exact: true })).toBeVisible();

  // Model navigating away immediately, without letting a deferred save run.
  await page.clock.pauseAt(new Date('2026-09-11T13:00:00Z'));
  await page.getByLabel('USDC budget').fill('10.000001');
  await page.getByLabel('AAPLx percentage').fill('51');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY);
  expect(stored.budget).toBe('10.000001');
  expect(stored.items[0].percent).toBe('51');
  await page.reload({ waitUntil: 'commit' });
  await page.clock.resume();

  await expect(page.getByLabel('USDC budget')).toHaveValue('10.000001');
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('51');
  // An unfinished split is a valid local draft even while estimates are disabled.
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
});

test('blocked local storage leaves the planner usable and reports unsaved edits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage disabled', 'SecurityError'); },
    });
  });
  await page.goto('/app?mode=example');
  await expect(page.getByText('Local saving unavailable', { exact: true })).toBeVisible();
  await page.getByLabel('USDC budget').fill('10.000001');
  await expect(page.getByLabel('USDC budget')).toHaveValue('10.000001');
  await expect(page.getByText('Local saving unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
