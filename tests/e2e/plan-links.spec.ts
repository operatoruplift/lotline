import { expect, test } from './test';
import AxeBuilder from '@axe-core/playwright';
import { DEFAULT_BASKET, EXAMPLE_ASSETS } from '../../lib/demo/example';
import { decodePlanHash, encodePlanHash } from '../../lib/domain/share';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';

test('a copied plan is reviewed before replacing the recipient’s existing draft', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const providerRequests: string[] = [];
  page.on('request', request => { if (/\/api\/(quotes|holdings|projections)/.test(request.url())) providerRequests.push(request.url()); });
  await page.goto('/app?mode=example');
  await page.getByLabel('USDC budget').fill('10.000001');
  for (const [symbol, value] of [['AAPLx', '33.33'], ['MSFTx', '33.33'], ['NVDAx', '33.34']]) await page.getByLabel(`${symbol} percentage`).fill(value);
  await page.getByRole('button', { name: 'Copy plan link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan link copied.' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(link);
  expect(url.origin).toBe(new URL(page.url()).origin);
  expect(url.search).toBe('?mode=example');
  const shared = decodePlanHash(url.hash)!;
  expect(shared.basket.budget).toBe('10.000001');

  const prior = { ...DEFAULT_BASKET, budget: '125.75' };
  await page.evaluate(({ key, basket }) => localStorage.setItem(key, JSON.stringify(basket)), { key: BASKET_STORAGE_KEY, basket: prior });
  // Open from another document, as a recipient would. A fragment-only change
  // intentionally leaves the current in-memory draft untouched.
  await page.goto('/how-it-works');
  await page.goto(link);
  const review = page.getByRole('dialog', { name: 'Review shared plan' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Keep my draft' })).toBeFocused();
  await expect(review.getByText('10.000001', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(prior);
  await review.getByRole('button', { name: 'Keep my draft' }).click();
  await expect(page.getByLabel('USDC budget')).toHaveValue('125.75');
  expect(new URL(page.url()).hash).toBe('');

  await page.goto(link);
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Apply shared plan' }).click();
  await expect(page.getByLabel('USDC budget')).toHaveValue('10.000001');
  await expect(page.getByLabel('NVDAx percentage')).toHaveValue('33.34');
  await expect(page.getByRole('button', { name: 'Example', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(shared.basket);
  expect(new URL(page.url()).hash).toBe('');
  expect(providerRequests).toEqual([]);
});

test('Live shares exclude a filled wallet and never request balances or quotes on apply', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  const providerRequests: string[] = [];
  page.on('request', request => { if (/\/api\/(quotes|holdings|projections)/.test(request.url())) providerRequests.push(request.url()); });
  await page.addInitScript(({ key, basket }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(basket)); }, { key: BASKET_STORAGE_KEY, basket: DEFAULT_BASKET });
  await page.goto('/app');
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
  const wallet = '7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj';
  await page.getByLabel('Wallet address', { exact: true }).fill(wallet);
  await page.getByRole('button', { name: 'Copy plan link', exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(link);
  expect(url.search).toBe('');
  const payload = Buffer.from(url.hash.slice(6), 'base64url').toString('utf8');
  expect(payload).not.toContain(wallet);
  expect(payload).not.toMatch(/wallet|quotes|account|holdings/);
  // A conflicting query cannot silently change the source mode in the fragment.
  await page.goto(`/app?mode=example${url.hash}`);
  await page.getByRole('dialog', { name: 'Review shared plan' }).getByRole('button', { name: 'Apply shared plan' }).click();
  await expect(page.getByRole('button', { name: 'Live', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Wallet address', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
  expect(providerRequests).toEqual([]);
});

test('malformed links and Escape preserve the draft, with an accessible mobile review', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/app?mode=example');
  await page.getByLabel('USDC budget').fill('78.123456');
  await page.goto('/app?mode=example#plan=broken');
  const review = page.getByRole('dialog', { name: 'Review shared plan' });
  await expect(review).toBeVisible();
  await expect(review.getByText(/invalid, incomplete/)).toBeVisible();
  await expect(review.getByRole('button', { name: 'Apply shared plan' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(review).not.toBeVisible();
  await expect(page.getByLabel('USDC budget')).toHaveValue('78.123456');
  expect(new URL(page.url()).hash).toBe('');

  const hash = encodePlanHash({ ...DEFAULT_BASKET, budget: '999999.999999' }, 'example');
  await page.goto(`/app?mode=example${hash}`);
  await expect(review).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map(violation => violation.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('USDC budget')).toHaveValue('78.123456');
});

test('browser navigation to another fragment closes a stale shared-plan review', async ({ page }) => {
  const hash = encodePlanHash(DEFAULT_BASKET, 'example');
  await page.goto(`/app?mode=example${hash}`);
  const review = page.getByRole('dialog', { name: 'Review shared plan' });
  await expect(review).toBeVisible();
  await page.evaluate(() => { window.location.hash = '#features'; });
  await expect(review).not.toBeVisible();
  expect(new URL(page.url()).hash).toBe('#features');
});

test('an unverified mint in a valid shared payload never bypasses the Live catalog', async ({ page }) => {
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  const requests: string[] = [];
  page.on('request', request => { if (/\/api\/(quotes|holdings|projections)/.test(request.url())) requests.push(request.url()); });
  const hash = encodePlanHash({ version: 1, budget: '10', items: [{ mint: '1'.repeat(32), percent: '100' }] }, 'live');
  await page.goto(`/app${hash}`);
  const review = page.getByRole('dialog', { name: 'Review shared plan' });
  await expect(review.getByText('Verification pending')).toBeVisible();
  await review.getByRole('button', { name: 'Apply shared plan' }).click();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  await expect(page.getByText('Unverified asset', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy plan link', exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
});

test('a blocked clipboard reports failure without claiming the link was copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new DOMException('Clipboard denied', 'NotAllowedError'); } } });
  });
  await page.goto('/app?mode=example');
  await page.getByRole('button', { name: 'Copy plan link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The plan link could not be copied.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Plan link copied.' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy plan link', exact: true })).toBeEnabled();
});

for (const scenario of [
  { name: 'empty draft and invalid link', basket: { version: 1 as const, budget: '17.000009', items: [] }, hash: '#plan=broken' },
  { name: 'unverified draft and valid link', basket: { version: 1 as const, budget: '81.000007', items: [{ mint: '1'.repeat(32), percent: '100' }] }, hash: encodePlanHash(DEFAULT_BASKET, 'example') },
]) {
  test(`review preserves a previous ${scenario.name} until consent`, async ({ page }) => {
    await page.addInitScript(({ key, basket }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(basket));
    }, { key: BASKET_STORAGE_KEY, basket: scenario.basket });
    await page.goto(`/app?mode=example${scenario.hash}`);
    const review = page.getByRole('dialog', { name: 'Review shared plan' });
    await expect(review).toBeVisible();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(scenario.basket);
    await review.getByRole('button', { name: 'Keep my draft' }).click();
    await expect(page.getByLabel('USDC budget')).toHaveValue(scenario.basket.budget);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(scenario.basket);
    await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  });
}
