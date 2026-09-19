import { expect, test } from './test';
import { DEFAULT_BASKET, EXAMPLE_ASSETS, getExampleHoldings, getExampleQuotes } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';

test('a first Live visit cannot leave the linked Example empty', async ({ page }) => {
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  await page.goto('/app');
  await expect(page.getByText('Draft ready', { exact: true })).toBeVisible();
  await expect(page.getByLabel('AAPLx percentage')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), BASKET_STORAGE_KEY)).toBeNull();
  await page.reload();
  await expect(page.getByText('Make your first split.', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), BASKET_STORAGE_KEY)).toBeNull();
  await page.getByRole('link', { name: 'How it works', exact: true }).first().click();
  await page.getByRole('link', { name: /try the example/i }).first().click();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled();
  await expect(page.locator('.network-badge')).toHaveText('Synthetic example');
});

test('removing every asset preserves that empty draft across linked Example navigation', async ({ page }) => {
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  await page.goto('/app');
  await page.getByRole('button', { name: 'Apply illustrative split', exact: true }).click();
  await page.getByLabel('USDC budget').fill('42.000007');
  for (const symbol of ['AAPLx', 'MSFTx', 'NVDAx']) await page.getByRole('button', { name: `Remove ${symbol}`, exact: true }).click();
  await expect(page.getByText('Your empty draft is preserved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'How it works', exact: true }).first().click();
  await page.getByRole('link', { name: /try the example/i }).first().click();
  await expect(page.getByText('0 / 10 assets', { exact: true })).toBeVisible();
  await expect(page.getByLabel('USDC budget')).toHaveValue('42.000007');
  await expect(page.getByLabel('AAPLx percentage')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('0 / 10 assets', { exact: true })).toBeVisible();
});

test('the Example toggle seeds only an untouched Live draft, preserving an edited empty one', async ({ page }) => {
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  await page.goto('/app');
  await expect(page.getByText('Draft ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Example', exact: true }).click();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled();

  await page.evaluate(key => localStorage.removeItem(key), BASKET_STORAGE_KEY);
  await page.goto('/app');
  await expect(page.getByText('Draft ready', { exact: true })).toBeVisible();
  await page.getByLabel('USDC budget').fill('19.000005');
  await expect(page.getByText('Draft saved here', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Example', exact: true }).click();
  await expect(page.getByText('0 / 10 assets', { exact: true })).toBeVisible();
  await expect(page.getByLabel('USDC budget')).toHaveValue('19.000005');
  await expect(page.getByLabel('AAPLx percentage')).toHaveCount(0);
});

test('replace an asset without losing its weight, split exactly, and reset deliberately', async ({ page }) => {
  await page.goto('/app?mode=example');
  await page.getByLabel('USDC budget').fill('10.000001');
  await page.getByRole('button', { name: 'Change MSFTx', exact: true }).click();
  await page.getByLabel('Choose an example xStock').selectOption(EXAMPLE_ASSETS.find(asset => asset.symbol === 'QQQx')!.mint);
  await expect(page.getByLabel('QQQx percentage')).toHaveValue('30');
  await expect(page.getByLabel('MSFTx percentage')).toHaveCount(0);
  await page.getByRole('button', { name: 'Split evenly', exact: true }).click();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('33.34');
  await expect(page.getByLabel('QQQx percentage')).toHaveValue('33.33');
  await expect(page.getByLabel('NVDAx percentage')).toHaveValue('33.33');
  await expect(page.getByRole('row', { name: /AAPLx/ }).getByRole('cell', { name: '3.334001', exact: true })).toBeVisible();
  await page.getByText('Verify this plan', { exact: true }).click();
  await expect(page.getByText('100% assigned · 0 micro-USDC left over', { exact: true })).toBeVisible();
  await expect(page.getByText('Includes the 1 micro-USDC remainder assigned to this asset.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset example', exact: true }).click();
  await expect(page.getByLabel('USDC budget')).toHaveValue('1000');
  await expect(page.getByLabel('MSFTx percentage')).toHaveValue('30');
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled();
});

test('mobile estimates reveal numeric results without requiring an extra scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app?mode=example');
  await page.getByLabel('USDC budget').fill('137.000001');
  await page.getByRole('button', { name: /^(Get estimates|Refresh estimates)$/ }).click();
  await expect(page.getByRole('row', { name: /AAPLx/ })).toBeInViewport({ ratio: 0.5 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Live provenance distinguishes pending quotes, a balance snapshot, and expiry', async ({ page }) => {
  await page.addInitScript(({ key, basket }) => localStorage.setItem(key, JSON.stringify(basket)), { key: BASKET_STORAGE_KEY, basket: DEFAULT_BASKET });
  const checkedAt = new Date().toISOString();
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS.map(asset => ({ ...asset, verifiedAt: checkedAt })), unavailable: [] } }));
  const holdings = getExampleHoldings(DEFAULT_BASKET.items.map(item => item.mint));
  holdings.fetchedAt = new Date(Date.now() - 120_000).toISOString();
  await page.route('**/api/holdings?**', route => route.fulfill({ json: holdings }));
  await page.route('**/api/quotes', route => {
    const quotes = getExampleQuotes(route.request().postDataJSON().items);
    quotes.quotes = quotes.quotes.map(quote => ({ ...quote, source: 'Jupiter', expiresAt: new Date(Date.now() + 2_000).toISOString() }));
    return route.fulfill({ json: quotes });
  });
  await page.route('**/api/units', route => route.fulfill({ json: { state: 'success', items: DEFAULT_BASKET.items.map(item => ({ mint: item.mint, units: '12' })) } }));
  await page.goto('/app');
  await expect(page.locator('.results-mode')).toHaveText('Ready for Live quotes');
  await page.getByRole('button', { name: 'Add wallet context', exact: true }).click();
  await expect(page.getByLabel('Wallet address', { exact: true })).toBeFocused();
  await page.getByLabel('Wallet address', { exact: true }).fill('11111111111111111111111111111111');
  await page.getByRole('button', { name: 'Load balances', exact: true }).click();
  await expect(page.getByText('At least a minute old. Reload balances for a fresh view.')).toBeVisible();
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.locator('.results-mode')).toHaveText('Live quotes received');
  await page.getByText('Verify this plan', { exact: true }).click();
  const receipt = page.locator('.verification-receipt');
  await expect(receipt.locator(`time[datetime="${checkedAt}"]`)).toHaveCount(3);
  await expect(receipt.getByRole('link', { name: /xStocks asset metadata/ })).toHaveCount(3);
  await expect(receipt.getByText('Fresh until', { exact: true })).toHaveCount(3);
  await expect(page.locator('.results-mode')).toHaveText('Quotes need refresh');
});
