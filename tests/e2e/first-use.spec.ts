import { expect, test, type Page } from './test';
import AxeBuilder from '@axe-core/playwright';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import { mkdir } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });
const assets = EXAMPLE_ASSETS.slice(0, 8).map(asset => ({ ...asset, verifiedAt: new Date().toISOString() }));
const catalog = { state: 'success', assets, unavailable: [] };

async function storedDraft(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY);
}

test('fresh Live visit shows search and an explicit current-catalog illustration, then exact estimates and provenance', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('**/api/assets', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: catalog });
  });
  const requests: { mint: string; usdcRaw: string }[][] = [];
  await page.route('**/api/quotes', async route => {
    const { items } = route.request().postDataJSON();
    requests.push(items);
    await route.fulfill({ json: { state: 'success', quotes: items.map((item: { mint: string; usdcRaw: string }) => ({ ...item, state: 'success', outRaw: '123000000', units: '1.23', fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30_000).toISOString(), source: 'Controlled quote fixture' })) } });
  });
  await page.goto('/app');
  await expect(page.getByText('Checking the Live catalog…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply illustrative split', exact: true })).toHaveCount(0);
  await page.getByLabel('USDC budget').fill('10.000001');
  await expect.poll(() => typeof release).toBe('function');
  release!();
  const search = page.getByLabel('Search stocks and ETFs');
  await expect(search).toBeVisible();
  await expect(search).not.toBeFocused();
  expect((await storedDraft(page)).items).toEqual([]);
  await expect(page.getByText(/Illustrative only, not a recommendation/)).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Apply illustrative split', exact: true }).click();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
  await expect(page.getByLabel('MSFTx percentage')).toHaveValue('30');
  await expect(page.getByLabel('NVDAx percentage')).toHaveValue('20');
  await expect(page.getByLabel('USDC budget')).toHaveValue('10.000001');
  await expect(page.getByText('Current USDC balance', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(3);
  expect(requests.flat().reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n)).toBe(10_000_001n);
  expect(requests.flat().map(item => item.mint)).toEqual(assets.slice(0, 3).map(asset => asset.mint));
  await page.getByText('Verify this plan', { exact: true }).click();
  await expect(page.locator('.receipt-assets').getByRole('link', { name: new RegExp(assets[0].mint) })).toBeVisible();
  await expect(page.locator('.receipt-assets').getByText('Controlled quote fixture', { exact: true })).toHaveCount(3);
});

test('a deliberately empty returning draft survives Example, Live, and reload without auto-seeding', async ({ page }) => {
  const draft = { version: 1, budget: '81.000007', items: [] };
  await page.addInitScript(({ key, draft }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft)); }, { key: BASKET_STORAGE_KEY, draft });
  await page.route('**/api/assets', route => route.fulfill({ json: catalog }));
  await page.goto('/app?mode=example');
  await expect(page.getByText('0 / 10 assets', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByText('Your empty draft is preserved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply illustrative split', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Example', exact: true }).click();
  await page.reload();
  await expect(page.getByText('0 / 10 assets', { exact: true })).toBeVisible();
  expect(await storedDraft(page)).toEqual(draft);
  // Reset remains an explicit way to replace the intentionally empty Example draft.
  await page.getByRole('button', { name: 'Reset example', exact: true }).click();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
});

test('catalog failure, successful empty response, and recovered catalog have distinct states', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/assets', route => {
    reads += 1;
    return reads === 1 ? route.fulfill({ status: 503, json: { state: 'unavailable', assets: [], unavailable: [], message: 'The issuer provider is unavailable.' } }) : route.fulfill({ json: reads === 2 ? { state: 'success', assets: [], unavailable: [] } : catalog });
  });
  await page.goto('/app');
  await expect(page.getByText('Live catalog unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('The issuer provider is unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Search stocks and ETFs')).toHaveCount(0);
  await page.getByLabel('USDC budget').fill('75.15');
  await page.getByRole('button', { name: 'Retry catalog', exact: true }).click();
  await expect(page.getByText('Catalog loaded without available assets', { exact: true })).toBeVisible();
  await expect(page.getByText('Live catalog unavailable', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry catalog', exact: true }).click();
  await expect(page.getByLabel('Search stocks and ETFs')).toBeVisible();
  await expect(page.getByLabel('USDC budget')).toHaveValue('75.15');
  await expect(page.getByRole('button', { name: 'Apply illustrative split', exact: true })).toBeEnabled();
  expect(reads).toBe(3);
});

test('failed refresh retains selected identity and edits as unverified until recovery', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/assets', route => {
    reads += 1;
    return reads === 2 ? route.abort('failed') : route.fulfill({ json: catalog });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Apply illustrative split', exact: true }).click();
  await page.getByLabel('USDC budget').fill('125.000001');
  const before = await storedDraft(page);
  await page.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
  await expect(page.getByText('Live catalog unavailable', { exact: true })).toBeVisible();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
  await expect(page.locator('.basket-row').getByText('Temporarily unverified', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Review first asset', exact: false })).toHaveCount(0);
  expect(await storedDraft(page)).toEqual(before);
  await page.getByRole('button', { name: 'Retry catalog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
  await expect(page.getByText('Temporarily unverified', { exact: true })).toHaveCount(0);
  expect(await storedDraft(page)).toEqual(before);
});

for (const width of [1440, 768, 390, 320]) {
  test(`first-use search, illustration, and controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/assets', route => route.fulfill({ json: catalog }));
    await page.goto('/app');
    await expect(page.getByLabel('Search stocks and ETFs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply illustrative split', exact: true })).toBeVisible();
    await expect(page.getByRole('banner').locator(':scope > div')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(',')).join('; ')}`)).toEqual([]);
    if (process.env.LOTLINE_CAPTURE_FIRST_USE === '1') {
      await mkdir('docs/releases/2026-09-20/first-use', { recursive: true });
      await page.screenshot({ path: `docs/releases/2026-09-20/first-use/after-${width}.png`, fullPage: true });
    }
  });
}
