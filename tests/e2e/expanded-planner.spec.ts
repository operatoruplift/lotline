import { expect, test } from './test';
import { readFile } from 'node:fs/promises';
import { XSTOCK_REGISTRY } from '../../lib/domain/assets';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';

const catalog = XSTOCK_REGISTRY.map(asset => ({ ...asset, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', halted: false, verifiedAt: new Date().toISOString() }));

test('ten-asset plans show batch progress, conserve micro-USDC, export, and persist', async ({ page }) => {
  const assets = catalog.slice(0, 10);
  const basket = { version: 1, budget: '10.000001', items: assets.map(asset => ({ mint: asset.mint, percent: '10' })) };
  await page.addInitScript(({ key, basket }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(basket));
  }, { key: BASKET_STORAGE_KEY, basket });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: catalog, unavailable: [] } }));
  const requests: { mint: string; usdcRaw: string }[][] = [];
  let releaseSecond: (() => void) | undefined;
  await page.route('**/api/quotes', async route => {
    const { items } = route.request().postDataJSON() as { items: { mint: string; usdcRaw: string }[] };
    requests.push(items);
    if (requests.length === 2) await new Promise<void>(resolve => { releaseSecond = resolve; });
    const fetchedAt = new Date().toISOString();
    await route.fulfill({ json: { state: 'success', quotes: items.map(item => ({ ...item, state: 'success', outRaw: '123000000', units: '1.23', fetchedAt, expiresAt: new Date(Date.now() + 30_000).toISOString(), source: 'Jupiter' })) } });
  });
  await page.goto('/app');
  await expect(page.getByText('10 / 10 assets', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add an asset', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect.poll(() => typeof releaseSecond).toBe('function');
  await expect(page.getByRole('button', { name: 'Getting estimates… 3 / 10', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(3);
  releaseSecond!();
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(10);
  expect(requests.map(items => items.length)).toEqual([3, 3, 3, 1]);
  expect(requests.flat().reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n)).toBe(10_000_001n);
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await pendingDownload;
  const csv = await readFile((await download.path())!, 'utf8');
  for (const asset of assets) expect(csv).toContain(asset.mint);
  expect(csv).toContain('1.000001');
  await page.getByLabel('USDC budget').fill('20.000001');
  await page.reload();
  await expect(page.getByLabel('USDC budget')).toHaveValue('20.000001');
  for (const asset of assets) await expect(page.getByLabel(`${asset.symbol} percentage`)).toHaveValue('10');
});

test('full catalog can be searched by company and ticker on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: catalog, unavailable: [] } }));
  await page.goto('/app');
  await page.getByRole('button', { name: 'Add an asset', exact: true }).click();
  const search = page.getByLabel('Search stocks and ETFs', { exact: true });
  await expect(search).toBeFocused();
  await search.fill('no-such-stock-xyz');
  await expect(page.getByText('No matches. Try a different company name or ticker.')).toBeVisible();
  await expect(page.getByLabel('Choose a verified xStock', { exact: true })).toBeDisabled();
  await search.fill('Amazon');
  const amazon = catalog.find(asset => asset.symbol === 'AMZNx')!;
  await page.getByLabel('Choose a verified xStock', { exact: true }).selectOption(amazon.mint);
  await expect(page.getByLabel('AMZNx percentage')).toBeVisible();
  // Vercel appends a deployment query to static asset URLs. Match the
  // verified logo path while still checking that the image really decodes.
  const logo = page.locator(`img[src*="${amazon.logoUrl}"]`).first();
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Add an asset', exact: true }).click();
  await search.fill('TSLAx');
  await expect(page.getByLabel('Choose a verified xStock', { exact: true }).locator('option')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
});
