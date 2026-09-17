import { expect, test } from './test';
import { readFile } from 'node:fs/promises';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';

test('a guest finds an additional Example asset by company on mobile without a live provider', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const providerCalls: string[] = [];
  await page.route(/\/api\/(assets|quotes|holdings|units|asset-details)(?:\?|$)/, route => {
    providerCalls.push(route.request().url());
    return route.abort();
  });
  await page.goto('/app?mode=example');
  await expect(page.getByText(/Explore 832 assets from the bundled identity snapshot/)).toBeVisible();
  await page.getByRole('button', { name: 'Add an asset', exact: true }).click();
  const picker = page.getByLabel('Choose an example xStock', { exact: true });
  await expect(picker.locator('option')).toHaveCount(EXAMPLE_ASSETS.length - 3 + 1);
  await page.getByLabel('Search stocks and ETFs').fill('Amazon');
  const amazon = EXAMPLE_ASSETS.find(asset => asset.symbol === 'AMZNx')!;
  await picker.selectOption(amazon.mint);
  await expect(page.getByLabel('AMZNx percentage')).toHaveValue('0');
  const logo = page.locator('.basket-row').filter({ has: page.getByLabel('AMZNx percentage', { exact: true }) }).locator('img');
  await expect(logo).toHaveCount(1);
  await logo.scrollIntoViewIfNeeded();
  await expect(logo).toBeInViewport();
  // Hosted Next images can append a deployment query; identity is the exact path.
  expect(await logo.evaluate(node => new URL((node as HTMLImageElement).src).pathname)).toBe(amazon.logoUrl);
  await expect.poll(() => logo.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Split evenly', exact: true }).click();
  await page.getByLabel('USDC budget').fill('100');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('row', { name: /AMZNx/ }).getByRole('cell', { name: 'Estimated +units +0.25', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('AMZNx percentage')).toHaveValue('25.00');
  await expect(page.getByLabel('USDC budget')).toHaveValue('100');
  expect(providerCalls).toEqual([]);
});

test('a ten-asset returning draft survives Live to Example and a changed contribution export', async ({ page }) => {
  const assets = EXAMPLE_ASSETS.slice(-10);
  const basket = { version: 1, budget: '10.000001', items: assets.map(asset => ({ mint: asset.mint, percent: '10' })) };
  await page.addInitScript(({ key, basket }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(basket)); }, { key: BASKET_STORAGE_KEY, basket });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets, unavailable: [] } }));
  await page.goto('/app');
  await expect(page.getByText('Draft saved here', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Example', exact: true }).click();
  for (const asset of assets) await expect(page.getByLabel(`${asset.symbol} percentage`)).toHaveValue('10');
  await page.reload();
  await expect(page.getByLabel('USDC budget')).toHaveValue('10.000001');
  await page.getByLabel('USDC budget').fill('20.000001');
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloaded;
  const csv = await readFile((await download.path())!, 'utf8');
  for (const asset of assets) expect(csv).toContain(asset.mint);
  expect(csv).toContain('2.000001');
  expect(csv).toContain('Fresh at export');
  await page.reload();
  await expect(page.getByLabel('USDC budget')).toHaveValue('20.000001');
  for (const asset of assets) await expect(page.getByLabel(`${asset.symbol} percentage`)).toHaveValue('10');
});

test('invalid percentage fields never look complete and numeric differences are exact', async ({ page }) => {
  await page.goto('/app?mode=example');
  await page.getByLabel('MSFTx percentage').fill('50');
  await page.getByLabel('NVDAx percentage').fill('');
  await expect(page.locator('.weight-total')).toContainText('Check percentage fields');
  await expect(page.locator('.weight-total')).not.toHaveClass(/\bvalid\b/);
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  await page.getByLabel('NVDAx percentage').fill('0');
  await page.getByLabel('AAPLx percentage').fill('49.99');
  await expect(page.locator('.weight-total')).toContainText('0.01% left to assign');
  await page.getByLabel('AAPLx percentage').fill('50.01');
  await expect(page.locator('.weight-total')).toContainText('0.01% over');
  await page.getByLabel('AAPLx percentage').fill('50');
  await expect(page.locator('.weight-total')).toContainText('100% allocated');
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
});

test('opening or switching to Example preserves an unsupported draft for explicit repair', async ({ page }) => {
  const basket = { version: 1, budget: '81.000007', items: [{ mint: '1'.repeat(32), percent: '100' }] };
  await page.addInitScript(({ key, basket }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(basket)); }, { key: BASKET_STORAGE_KEY, basket });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS.slice(0, 3), unavailable: [] } }));
  await page.goto('/app?mode=example');
  await expect(page.getByLabel('USDC budget')).toHaveValue(basket.budget);
  await expect(page.getByText('A selected asset is outside the bundled Example catalog. Change or remove it, or switch to Live for current verification.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(basket);
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Example', exact: true }).click();
  await expect(page.getByLabel('USDC budget')).toHaveValue(basket.budget);
  await expect(page.getByRole('button', { name: 'Change unverified asset', exact: true })).toBeEnabled();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(basket);
});

test('an expired estimate remains explicitly stale when copied or downloaded', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.install();
  await page.goto('/app?mode=example');
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled();
  await page.clock.fastForward(31_000);
  await expect(page.locator('.quote-freshness')).toContainText('stale');
  await page.getByRole('button', { name: 'Copy plan', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Stale — refresh required');
  expect(copied).toContain('Fresh until:');
  expect(copied).toContain('Exporting does not refresh estimates.');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloaded;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Stale — refresh required');
  expect(csv).toContain('500.000000');
});
