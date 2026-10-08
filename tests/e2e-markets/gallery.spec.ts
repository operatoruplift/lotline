import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../e2e/test';
import type { GalleryPlan } from '../../lib/domain/gallery';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';

const [first, second, third] = EXAMPLE_ASSETS.map(asset => asset.mint);
const plans: GalleryPlan[] = [
  { id: '6a1f8c4e-2b7d-4c1e-9f0a-3d5b7e9c1a2b', name: 'Big tech core', display_name: 'Alice', copy_count: 12, published_at: '2026-09-27T12:00:00.000Z', allocations: [{ mint: first, bps: '5000' }, { mint: second, bps: '3000' }, { mint: third, bps: '2000' }], author_key: 'a1'.repeat(12) },
  { id: '0d9c8b7a-6f5e-4d3c-8b1a-0f9e8d7c6b5a', name: 'Chips only', display_name: null, copy_count: 2, published_at: '2026-09-28T09:00:00.000Z', allocations: [{ mint: third, bps: '10000' }], author_key: 'b2'.repeat(12) },
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
  await expect(cards.first()).toContainText('Rank 1');
  await expect(cards.first()).toContainText('AAPLx 50% · MSFTx 30% · NVDAx 20%');
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

test('a leaderboard row opens the full split in a sheet that lives in the URL, and copies from there', async ({ page }) => {
  const copies = await mockGallery(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plans');
  await page.getByRole('article').first().getByRole('button', { name: 'Big tech core', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Big tech core' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('by Alice');
  await expect(sheet.getByRole('list', { name: 'Every weight' }).getByRole('listitem')).toHaveCount(3);
  await expect(page).toHaveURL(new RegExp(`/plans\\?plan=${plans[0].id}$`));
  const accessibility = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/plans$/);

  // A reopened link opens the same sheet, and copying from it goes to the review with a counted copy.
  await page.goto(`/plans?plan=${plans[0].id}`);
  await expect(page.getByRole('dialog', { name: 'Big tech core' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Big tech core' }).getByRole('button', { name: 'Copy into my plan' }).click();
  await expect(page.getByRole('dialog', { name: 'Review shared plan' })).toBeVisible();
  await expect.poll(() => copies).toEqual([plans[0].id]);
});

test('on phones the app screens keep only the brand in the header and shrink the footer', async ({ page }) => {
  await mockGallery(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plans');
  const header = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(header.getByRole('link', { name: 'Markets', exact: true })).toBeHidden();
  await expect(header.getByText('Solana mainnet')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Planning sections' }).getByRole('link', { name: 'Markets' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /A clearer/ })).toBeHidden();
  const footer = page.getByRole('navigation', { name: 'Footer navigation' });
  await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/privacy');
  await expect(footer.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/terms');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(header.getByRole('link', { name: 'Markets', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /A clearer/ })).toBeVisible();
});

test('a reader reports a shared plan with a short reason, from its sheet', async ({ page }) => {
  await mockGallery(page);
  const reports: unknown[] = [];
  await page.route('**/api/gallery/report', route => { reports.push(route.request().postDataJSON()); return route.fulfill({ json: { state: 'success' } }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plans');
  await page.getByRole('article').first().getByRole('button', { name: 'Big tech core', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Big tech core' });
  await sheet.getByRole('button', { name: 'Report', exact: true }).click();
  const reasons = sheet.getByRole('group', { name: 'Why are you reporting this plan?' });
  await expect(reasons.getByRole('radio')).toHaveCount(4);
  await expect(sheet.getByRole('button', { name: 'Send report' })).toBeDisabled();
  await reasons.getByRole('radio', { name: 'Spam or advertising' }).check();
  const accessibility = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await sheet.getByRole('button', { name: 'Send report' }).click();
  await expect(sheet.getByText('Thanks for the report.')).toBeVisible();
  expect(reports).toEqual([{ id: plans[0].id, reason: 'spam' }]);
  // Reporting changes nothing else: the plan stays open and listed.
  await expect(sheet.getByRole('button', { name: 'Copy into my plan' })).toBeVisible();
});

test('a report that cannot be sent says why and keeps the chosen reason', async ({ page }) => {
  await mockGallery(page);
  await page.route('**/api/gallery/report', route => route.fulfill({ status: 429, json: { state: 'rate-limited', message: 'You have sent several reports recently. Try again in an hour.' } }));
  await page.goto(`/plans/${plans[0].id}`);
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByRole('radio', { name: 'Offensive name' }).check();
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.locator('main#main').getByRole('alert')).toContainText('Try again in an hour.');
  await expect(page.getByRole('radio', { name: 'Offensive name' })).toBeChecked();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Report', exact: true })).toBeVisible();
});

test('hiding an author removes their plans on this device until the reader shows them again', async ({ page }) => {
  await mockGallery(page);
  await page.goto('/plans');
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(2);
  await cards.first().getByRole('button', { name: 'Big tech core', exact: true }).click();
  await page.getByRole('dialog', { name: 'Big tech core' }).getByRole('button', { name: 'Hide plans from this author' }).click();
  await expect(page.getByRole('dialog', { name: 'Big tech core' })).toHaveCount(0);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Chips only');
  await expect(page.getByText('Plans from Alice are hidden on this device.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cards).toHaveCount(2);

  // Hidden again, it stays hidden after a reload, and the list of hidden authors brings it back.
  await cards.first().getByRole('button', { name: 'Big tech core', exact: true }).click();
  await page.getByRole('dialog', { name: 'Big tech core' }).getByRole('button', { name: 'Hide plans from this author' }).click();
  const stored = await page.evaluate(() => localStorage.getItem('lotline:hidden-authors:v1'));
  expect(JSON.parse(stored!)).toEqual([expect.objectContaining({ key: plans[0].author_key, name: 'Alice' })]);
  await page.reload();
  await expect(page.locator('main#main')).toBeVisible();
  await expect(cards).toHaveCount(1);
  await page.getByText('1 author hidden on this device').click();
  await page.getByRole('button', { name: 'Show plans from Alice' }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByText('1 author hidden on this device')).toHaveCount(0);
});

test('a hidden author’s plan page says so and offers to show their plans again', async ({ page }) => {
  await mockGallery(page);
  await page.addInitScript(key => localStorage.setItem('lotline:hidden-authors:v1', JSON.stringify([{ key, name: 'Alice', since: '2026-10-07T09:00:00.000Z' }])), plans[0].author_key);
  await page.goto(`/plans/${plans[0].id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'You hid plans from this author.' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Every weight' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show their plans again' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Big tech core' })).toBeVisible();
});
