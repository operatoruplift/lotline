import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../e2e/test';
import type { GalleryPlan } from '../../lib/domain/gallery';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';

const [first, second, third] = EXAMPLE_ASSETS.map(asset => asset.mint);
const plans: GalleryPlan[] = [
  { id: '6a1f8c4e-2b7d-4c1e-9f0a-3d5b7e9c1a2b', name: 'Big tech core', display_name: 'Alice', copy_count: 12, published_at: '2026-09-27T12:00:00.000Z', allocations: [{ mint: first, bps: '5000' }, { mint: second, bps: '3000' }, { mint: third, bps: '2000' }] },
  { id: '0d9c8b7a-6f5e-4d3c-8b1a-0f9e8d7c6b5a', name: 'Chips only', display_name: null, copy_count: 2, published_at: '2026-09-28T09:00:00.000Z', allocations: [{ mint: third, bps: '10000' }] },
];

async function mockGallery(page: Page) {
  const copies: string[] = [];
  await page.route('**/api/gallery?**', route => {
    const sort = new URL(route.request().url()).searchParams.get('sort');
    return route.fulfill({ json: { state: 'success', sort, page: 1, hasMore: false, plans: sort === 'recent' ? [...plans].reverse() : plans } });
  });
  await page.route(`**/api/gallery/${plans[0].id}`, route => route.fulfill({ json: { state: 'success', plan: plans[0] } }));
  await page.route('**/api/gallery/00000000-0000-4000-8000-000000000000', route => route.fulfill({ status: 404, json: { state: 'not-found', message: 'This plan is no longer shared.' } }));
  await page.route('**/api/gallery/copy', route => { copies.push(route.request().postDataJSON().id); return route.fulfill({ json: { state: 'success', counted: false } }); });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  return copies;
}

test('community plans rank by copies, never show a budget, and copy into the review dialog with the reader’s budget', async ({ page }) => {
  const copies = await mockGallery(page);
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ version: 1, budget: '75', items: [] })), BASKET_STORAGE_KEY);
  await page.goto('/plans');
  await expect(page.getByRole('heading', { level: 1, name: 'Splits other members keep coming back to.' })).toBeVisible();
  await expect(page.getByText('Never a budget, a balance, a wallet or anyone’s activity.')).toBeVisible();
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Big tech core');
  await expect(cards.first()).toContainText('by Alice');
  await expect(cards.first()).toContainText('12 copies');
  await expect(cards.nth(1)).toContainText('by a Lotline member');
  await expect(page.getByRole('article').first().getByLabel('Rank 1')).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Newest' }).click();
  await expect(cards.first()).toContainText('Chips only');
  await page.getByRole('button', { name: 'Most copied' }).click();
  await page.getByRole('button', { name: 'Copy Big tech core into your plan' }).click();
  const review = page.getByRole('dialog', { name: 'Review shared plan' });
  await expect(review).toBeVisible();
  await expect(review).toContainText('75');
  // The copy count is recorded asynchronously; on a cold server it can land after the dialog opens.
  await expect.poll(() => copies).toEqual([plans[0].id]);
});

test('a shared plan has its own page with every weight, a copy link and a gone state', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockGallery(page);
  await page.goto(`/plans/${plans[0].id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Big tech core' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: '50%' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Copy link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  await page.goto('/plans/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'This plan is no longer shared.' })).toBeVisible();
});

test('the gallery fits a 320px screen and the add sheet offers community plans', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockGallery(page);
  await page.goto('/plans');
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('navigation', { name: 'Planning sections' }).getByRole('button', { name: /Start or extend a plan/ }).click();
  await expect(page.getByRole('dialog', { name: 'Start or extend a plan' }).getByRole('link', { name: /Copy a community plan/ })).toHaveAttribute('href', '/plans');
});
