import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../e2e/test';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';
import type { GalleryPlan } from '../../lib/domain/gallery';

const [AAPLX, MSFTX, NVDAX] = EXAMPLE_ASSETS.map(asset => asset.mint);
const split = (a: string, b: string, c: string) => [{ mint: AAPLX, bps: a }, { mint: MSFTX, bps: b }, { mint: NVDAX, bps: c }];
const shared: GalleryPlan = { id: '6a1f8c4e-2b7d-4c1e-9f0a-3d5b7e9c1a2b', name: 'Big tech core', display_name: 'Alice', copy_count: 12, published_at: '2026-09-27T12:00:00.000Z', allocations: split('5000', '3000', '2000') };

/** The community API as a fixture whose current split a test can change, the way an author would. */
async function community(page: Page) {
  const state = { plan: shared as GalleryPlan, gone: false };
  await page.route('**/api/gallery?**', route => route.fulfill({ json: { state: 'success', sort: 'copies', page: 1, hasMore: false, plans: [state.plan] } }));
  await page.route(`**/api/gallery/${shared.id}`, route => state.gone
    ? route.fulfill({ status: 404, json: { state: 'not-found', message: 'This plan is no longer shared.' } })
    : route.fulfill({ json: { state: 'success', plan: state.plan } }));
  await page.route('**/api/gallery/copy', route => route.fulfill({ json: { state: 'success', counted: false } }));
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  return state;
}

test('copying follows a plan, and Portfolio shows what its author changed until the member decides', async ({ page }) => {
  const author = await community(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plans');
  await page.getByRole('button', { name: 'Copy Big tech core into your plan' }).click();
  await expect(page.getByRole('dialog', { name: 'Review shared plan' })).toBeVisible();

  await page.goto('/portfolio');
  const following = page.getByRole('region', { name: 'Following' });
  await expect(following.getByRole('listitem').filter({ hasText: 'Big tech core' })).toContainText('Up to date');

  author.plan = { ...shared, allocations: split('5000', '2500', '2500'), split_updated_at: '2026-09-30T10:00:00.000Z' };
  await page.reload();
  const item = following.getByRole('listitem').filter({ hasText: 'Big tech core' }).first();
  await expect(item).toContainText('Alice changed the split on 30 Sept.');
  await expect(item.getByRole('list', { name: 'What changed in Big tech core' }).getByRole('listitem')).toHaveText(['MSFTx 30% → 25%', 'NVDAx 20% → 25%']);
  const accessibility = await new AxeBuilder({ page }).include('#following-title').include('section[aria-labelledby="following-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await item.getByRole('button', { name: 'Keep my split' }).click();
  await expect(item).toContainText('Up to date');

  author.plan = { ...shared, allocations: split('4000', '3000', '3000'), split_updated_at: '2026-10-01T09:00:00.000Z' };
  await page.reload();
  await expect(item).toContainText('AAPLx 50% → 40%');
  await item.getByRole('button', { name: 'Review the new split' }).click();
  const review = page.getByRole('dialog', { name: 'Review shared plan' });
  await expect(review).toContainText('40');
  await page.goto('/portfolio');
  await expect(item).toContainText('Up to date');
  await item.getByRole('button', { name: 'Stop following Big tech core' }).click();
  await expect(following).toHaveCount(0);
});

test('a followed plan that stops being shared says so and can be let go', async ({ page }) => {
  const author = await community(page);
  await page.goto('/plans');
  await page.getByRole('button', { name: 'Big tech core', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Big tech core' });
  const follow = sheet.getByRole('button', { name: 'Follow updates' });
  await follow.click();
  await expect(sheet.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('article').first()).toContainText('Following');

  author.gone = true;
  await page.goto('/portfolio');
  const item = page.getByRole('region', { name: 'Following' }).getByRole('listitem').filter({ hasText: 'Big tech core' });
  await expect(item).toContainText('No longer shared. Your plan is unaffected.');
  await item.getByRole('button', { name: 'Stop following Big tech core' }).click();
  await expect(page.getByRole('region', { name: 'Following' })).toHaveCount(0);
});

test('an author points a shared plan at a newer saved split, keeping its link and copies', async ({ page }) => {
  const [first, second] = [
    { id: 'ccf2689b-66a7-45c0-8d7f-ebdf84c7e2e7', name: 'Big tech core', budget_raw: '250000000', allocations: split('5000', '3000', '2000'), created_at: '2026-09-27T12:00:00Z' },
    { id: '0d9c8b7a-6f5e-4d3c-8b1a-0f9e8d7c6b5a', name: 'Big tech core v2', budget_raw: '250000000', allocations: split('4000', '3000', '3000'), created_at: '2026-09-30T12:00:00Z' },
  ];
  const updates: unknown[] = [];
  await page.route('**/api/auth/session', route => route.fulfill({ json: { state: 'signed-in', user: { id: 'author', email: 'author@example.test' } } }));
  await page.route('**/api/plans', route => route.fulfill({ json: { state: 'success', plans: [second, first] } }));
  await page.route('**/api/gallery/mine', route => route.fulfill({ json: { shared: [{ id: shared.id, plan_id: first.id, display_name: 'Alice', copy_count: 12, published_at: shared.published_at }] } }));
  await page.route('**/api/gallery/publish', route => { updates.push(route.request().postDataJSON()); return route.fulfill({ json: { state: 'success', id: shared.id } }); });
  await page.goto('/app?mode=example');
  const cloud = page.getByRole('region', { name: 'Keep a plan for later' });
  await expect(cloud.getByText('Shared as Alice · 12 copies')).toBeVisible();
  await cloud.getByRole('button', { name: 'Update a shared plan with Big tech core v2’s split' }).click();
  await expect(cloud.getByLabel('Shared plan to update')).toHaveValue(shared.id);
  await cloud.getByRole('button', { name: 'Update split' }).click();
  await expect(cloud.getByRole('status').filter({ hasText: 'Big tech core now shares Big tech core v2’s split.' })).toBeVisible();
  expect(updates).toEqual([{ publishedId: shared.id, planId: second.id }]);
  await expect(cloud.getByRole('button', { name: 'Stop sharing Big tech core v2' })).toBeVisible();
  await expect(cloud.getByRole('button', { name: 'Share Big tech core to community plans' })).toBeVisible();
});
