import { readFile } from 'node:fs/promises';
import { expect, test } from './test';
import { PRESTOCK_REGISTRY, PRESTOCK_ISSUER_URL } from '../../lib/domain/prestocks';
import { PLANNER_UNIVERSES } from '../../lib/domain/planner-universe';
import { DEFAULT_BASKET, EXAMPLE_ASSETS } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import { decodePlanHash, encodePlanHash } from '../../lib/domain/share';

const catalog = PRESTOCK_REGISTRY.map(asset => ({ ...asset, issuerId: 'prestocks', issuerSourceUrl: PRESTOCK_ISSUER_URL, instrumentId: `prestocks:solana:${asset.mint}`, halted: null, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', verifiedAt: new Date().toISOString() }));
const asset = catalog.find(asset => asset.symbol === 'OPENAI')!;
const draftKey = PLANNER_UNIVERSES.prestocks.storageKey;
const basket = { version: 1 as const, budget: '10.000001', items: [{ mint: asset.mint, percent: '100' }] };

test('mobile PreStocks planning isolates drafts, uses its read endpoint, exports and shares without signing', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(({ key, basket }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(basket)); }, { key: BASKET_STORAGE_KEY, basket: DEFAULT_BASKET });
  await page.route('**/api/prestocks/assets', route => route.fulfill({ json: { state: 'success', assets: catalog, unavailable: [] } }));
  const requests: { mint: string; usdcRaw: string }[][] = [];
  const unsupported: string[] = [];
  page.on('request', request => { if (/\/api\/(execution|plans|contribution-schedules|asset-details|market-reference)(\/|\?|$)/.test(request.url())) unsupported.push(request.url()); });
  await page.route('**/api/prestocks/quotes', route => {
    const { items } = route.request().postDataJSON() as { items: { mint: string; usdcRaw: string }[] };
    requests.push(items);
    const fetchedAt = new Date().toISOString();
    return route.fulfill({ json: { state: 'success', quotes: items.map(item => ({ ...item, state: 'success', outRaw: '1000000000', units: '1.25', fetchedAt, expiresAt: new Date(Date.now() + 30_000).toISOString(), source: 'Jupiter' })) } });
  });
  await page.goto('/pre-ipo?mode=example');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your PreStocks contribution.');
  await expect(page.getByRole('button', { name: 'Example', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('USDC budget')).toHaveValue('1000');
  await expect(page.getByText('Planning only. No in-app purchases, cloud plans, or reminders.', { exact: true })).toBeVisible();
  await page.getByLabel('Search PreStocks', { exact: true }).fill('OPENAI');
  await page.getByLabel('Choose a verified PreStock', { exact: true }).selectOption(asset.mint);
  await page.getByLabel('USDC budget').fill(basket.budget);
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  // Mobile cells also expose their CSS data-label text in the accessible name.
  await expect(page.locator('.results-table td[data-label="Estimated +units"]')).toHaveText('+1.25');
  expect(requests).toEqual([[{ mint: asset.mint, usdcRaw: '10000001' }]]);
  await page.getByText('Verify this plan', { exact: true }).click();
  await expect(page.getByText('Not published by PreStocks', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'PreStocks asset metadata' })).toHaveAttribute('href', PRESTOCK_ISSUER_URL);
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await pendingDownload;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('10.000001'); expect(csv).toContain('PreStocks'); expect(csv).toContain(asset.mint);
  await page.getByRole('button', { name: 'Copy plan link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan link copied.' })).toBeVisible();
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(link.pathname).toBe('/pre-ipo');
  expect(decodePlanHash(link.hash)).toEqual({ basket, mode: 'live', universe: 'prestocks' });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(DEFAULT_BASKET);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey)).toEqual(basket);
  expect(unsupported).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByLabel('USDC budget')).toHaveValue('10.000001');
  await expect(page.getByLabel('OPENAI percentage')).toHaveValue('100');
});

test('shared links cannot replace a draft in the other asset catalog', async ({ page }) => {
  await page.addInitScript(({ xKey, pKey, xBasket, pBasket }) => {
    if (!localStorage.getItem(xKey)) localStorage.setItem(xKey, JSON.stringify(xBasket));
    if (!localStorage.getItem(pKey)) localStorage.setItem(pKey, JSON.stringify(pBasket));
  }, { xKey: BASKET_STORAGE_KEY, pKey: draftKey, xBasket: DEFAULT_BASKET, pBasket: basket });
  await page.route('**/api/prestocks/assets', route => route.fulfill({ json: { state: 'success', assets: catalog, unavailable: [] } }));
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  for (const path of [`/pre-ipo${encodePlanHash(DEFAULT_BASKET, 'example')}`, `/app${encodePlanHash(basket, 'live', 'prestocks')}`]) {
    await page.goto(path);
    const dialog = page.getByRole('dialog', { name: 'Review shared plan' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/belongs to a different asset catalog/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Apply shared plan' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Keep my draft' }).click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BASKET_STORAGE_KEY)).toEqual(DEFAULT_BASKET);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey)).toEqual(basket);
  }
});

test('unknown halt status does not weaken the existing xStocks catalog validator', async ({ page }) => {
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: [{ ...EXAMPLE_ASSETS[0], halted: null }], unavailable: [] } }));
  await page.goto('/app');
  await expect(page.getByText('Live catalog unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
});
