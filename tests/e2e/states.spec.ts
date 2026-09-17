import { expect, test, type Page } from './test';
import { DEFAULT_BASKET, EXAMPLE_ASSETS, getExampleHoldings, getExampleQuotes } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import type { QuotesResponse } from '../../lib/domain/types';

async function seedLive(page: Page) {
  await page.addInitScript(({ key, basket }) => localStorage.setItem(key, JSON.stringify(basket)), { key: BASKET_STORAGE_KEY, basket: DEFAULT_BASKET });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
}

test('missing RPC leaves a clear path to the complete Example experience', async ({ page }) => {
  await page.route('**/api/assets', route => route.fulfill({ status: 503, json: { state: 'configuration-required', assets: [], unavailable: [], message: 'Live needs SOLANA_RPC_URL on the server. Example mode is ready to use.' } }));
  await page.goto('/app');
  await expect(page.getByText(/Live needs SOLANA_RPC_URL/)).toBeVisible();
  await page.getByRole('button', { name: 'Try Example mode', exact: true }).click();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled();
});

test('zero balances, partial failures, insufficient USDC, and invalid wallet remain distinct', async ({ page }) => {
  await seedLive(page);
  const holdings = getExampleHoldings(DEFAULT_BASKET.items.map(item => item.mint));
  holdings.state = 'partial';
  holdings.holdings[0] = { mint: EXAMPLE_ASSETS[0].mint, state: 'success', raw: '0', units: '0' };
  holdings.holdings[1] = { mint: EXAMPLE_ASSETS[1].mint, state: 'unavailable', raw: null, units: null, message: 'RPC temporarily unavailable.' };
  holdings.usdc = { ...holdings.usdc, raw: '1000000', units: '1' };
  delete holdings.message;
  await page.route('**/api/holdings?**', route => route.fulfill({ json: holdings }));
  await page.goto('/app');
  await page.getByLabel('Wallet address', { exact: true }).fill('invalid');
  await expect(page.getByLabel('Wallet address', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Load balances', exact: true })).toBeDisabled();
  await page.getByLabel('Wallet address', { exact: true }).fill('11111111111111111111111111111111');
  await page.getByRole('button', { name: 'Load balances', exact: true }).click();
  const apple = page.getByRole('row', { name: /AAPLx/ });
  const microsoft = page.getByRole('row', { name: /MSFTx/ });
  await expect(apple.getByRole('cell', { name: '0', exact: true })).toBeVisible();
  await expect(microsoft.getByRole('cell', { name: 'Unavailable', exact: true })).toBeVisible();
  await expect(page.getByText(/Your budget exceeds this USDC balance/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
  const stored = await page.evaluate(key => localStorage.getItem(key), BASKET_STORAGE_KEY);
  expect(stored).not.toContain('11111111111111111111111111111111');
});

test('late quote response cannot replace a newer budget', async ({ page }) => {
  await seedLive(page);
  let firstRequested = false;
  let firstFulfilled = false;
  let releaseFirst: (() => void) | undefined;
  await page.route('**/api/quotes', async route => {
    const request = route.request().postDataJSON() as { items: { mint: string; usdcRaw: string }[] };
    const quotes = getExampleQuotes(request.items);
    const isFirst = !firstRequested;
    if (isFirst) {
      firstRequested = true;
      quotes.quotes = quotes.quotes.map(quote => ({ ...quote, units: '999999', source: 'Jupiter' }));
      await new Promise<void>(resolve => { releaseFirst = resolve; });
    } else {
      quotes.quotes = quotes.quotes.map(quote => ({ ...quote, units: '123456', source: 'Jupiter' }));
    }
    await route.fulfill({ json: quotes });
    if (isFirst) firstFulfilled = true;
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect.poll(() => firstRequested).toBe(true);
  await page.getByLabel('USDC budget').fill('200');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('cell', { name: '+123,456', exact: true }).first()).toBeVisible();
  releaseFirst!();
  await expect.poll(() => firstFulfilled).toBe(true);
  // Give the browser a paint after the obsolete response finishes before inspecting the retained result.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('cell', { name: '+999,999', exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: '+123,456', exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('USDC budget')).toHaveValue('200');
});

test('no-route and unsupported-scaling estimates never become invented values', async ({ page }) => {
  await seedLive(page);
  await page.route('**/api/quotes', route => {
    const { items } = route.request().postDataJSON() as { items: { mint: string; usdcRaw: string }[] };
    const data: QuotesResponse = getExampleQuotes(items);
    data.state = 'partial';
    data.quotes[0] = { ...data.quotes[0], state: 'unavailable', outRaw: null, units: null, message: 'Jupiter could not provide a usable route. Try again later.' };
    data.quotes[1] = { ...data.quotes[1], units: null, message: 'Mint scaling could not be verified. Units unavailable.' };
    return route.fulfill({ json: data });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('row', { name: /AAPLx/ }).getByRole('cell', { name: 'Unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /MSFTx/ }).getByRole('cell', { name: 'Units unavailable', exact: true })).toBeVisible();
  await expect(page.getByText(/Jupiter could not provide a usable route/)).toBeVisible();
});

test('provider expiry marks estimates stale and offline mode remains explicit', async ({ page, context }) => {
  await seedLive(page);
  await page.route('**/api/quotes', route => {
    const { items } = route.request().postDataJSON() as { items: { mint: string; usdcRaw: string }[] };
    const data = getExampleQuotes(items);
    data.quotes.forEach(quote => { quote.expiresAt = new Date(Date.now() + 500).toISOString(); });
    return route.fulfill({ json: data });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByText(/Estimates are stale/)).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('main').getByText(/You’re offline/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Example', exact: true }).click();
  await expect(page.getByText(/Example mode still works/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled();
});

test('estimates wait for the holdings read so projections use the completed snapshot', async ({ page }) => {
  await seedLive(page);
  let release: (() => void) | undefined;
  await page.route('**/api/holdings?**', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: getExampleHoldings(DEFAULT_BASKET.items.map(item => item.mint)) });
  });
  await page.goto('/app');
  await page.getByLabel('Wallet address', { exact: true }).fill('11111111111111111111111111111111');
  await page.getByRole('button', { name: 'Load balances', exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  release!();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
});
