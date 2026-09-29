import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../e2e/test';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import { CRYPTO_REGISTRY, SPL_TOKEN_PROGRAM, WRAPPED_SOL_MINT } from '../../lib/domain/crypto-assets';
import type { MarketSnapshot } from '../../lib/domain/markets';

// This suite's server runs with LOTLINE_CRYPTO_ENABLED=true.
const CBBTC = CRYPTO_REGISTRY.find(asset => asset.symbol === 'cbBTC')!.mint;
const FETCHED = new Date(Date.now() - 60_000).toISOString();
const figures = (price: number, change: number) => ({ price, change24hPct: change, volume24hUsd: 5_000_000, liquidityUsd: 30_000_000, marketCapUsd: 1_000_000_000, holders: 90_000, updatedAt: FETCHED });
const snapshot: MarketSnapshot = { state: 'success', source: 'Jupiter Tokens API', fetchedAt: FETCHED, missing: 0, stats: { [WRAPPED_SOL_MINT]: figures(119.25, -2.1), [CBBTC]: figures(83810.19, 1.4) } };

async function markets(page: Page) {
  await page.route('**/api/markets', route => route.fulfill({ json: snapshot }));
  await page.route('**/api/markets/chart?**', route => { const url = new URL(route.request().url()); return route.fulfill({ json: { state: 'unavailable', mint: url.searchParams.get('mint'), range: url.searchParams.get('range'), points: [], message: 'No chart in this fixture.' } }); });
}

test('the Crypto tab lists the pinned tokens, and a sheet says who stands behind one and adds it to the stock plan', async ({ page }) => {
  await markets(page);
  await page.goto('/markets');
  await page.getByRole('button', { name: /^Crypto/ }).click();
  await expect(page).toHaveURL(/category=crypto/);
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({ hasText: 'JitoSOL' })).toContainText('Staked SOL');

  await page.goto(`/markets?asset=${CBBTC}`);
  const sheet = page.getByRole('dialog', { name: 'Coinbase Wrapped BTC' });
  await expect(sheet).toContainText('Coinbase · Bridged BTC');
  await expect(sheet).toContainText('Coinbase, pinned mint checked on-chain · the issuer can freeze balances');
  await expect(sheet).toContainText('Bitcoin held by Coinbase, one for one');
  await expect(sheet.getByRole('heading', { name: 'Similar exposure · Bitcoin' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Open WBTC/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Open BITXx/ })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await sheet.getByRole('button', { name: /Add to plan/ }).click();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).items).toEqual([{ mint: CBBTC, percent: '100' }]);
});

test('with crypto in the verified catalog, the planner offers it and SOL joins a plan', async ({ page }) => {
  const sol = { symbol: 'SOL', name: 'Solana', mint: WRAPPED_SOL_MINT, decimals: 9, tokenProgram: SPL_TOKEN_PROGRAM, halted: false, verifiedAt: new Date().toISOString(), logoUrl: '/logos/crypto/SOL.png', underlyingSymbol: 'SOL' };
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: [...EXAMPLE_ASSETS.slice(0, 3).map(asset => ({ ...asset, verifiedAt: new Date().toISOString() })), sol], unavailable: [] } }));
  await page.goto('/app');
  await expect(page.getByText('4 verified assets', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Search stocks, ETFs and crypto')).toBeVisible();
  await page.getByLabel('Choose a verified asset').selectOption(WRAPPED_SOL_MINT);
  await expect(page.getByLabel('SOL percentage')).toHaveValue('100');
  // next/image writes the absolute URL, so match the bundled path's ending.
  await expect(page.locator('.basket-row img[src$="/logos/crypto/SOL.png"]')).toHaveCount(1);
});
