import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';
import { pythConfidenceBps, pythDecimal, type MarketReferenceResponse, type PythObservation } from '../../lib/domain/market-reference';
import { mkdir } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });
const assets = EXAMPLE_ASSETS.slice(0, 3);
const panel = (page: Page) => page.locator('[data-market-reference]');

function references(mints: string[], now: number, price = '20000', age = 0): MarketReferenceResponse {
  const publishTime = Math.floor(now / 1000) - age;
  const fetchedAt = new Date(now).toISOString();
  const expiresAt = new Date((publishTime + 60) * 1000).toISOString();
  const state = age >= 60 ? 'stale' : 'fresh';
  const observation = (index: number, kind: PythObservation['kind']): PythObservation => ({
    feedId: (index + (kind === 'token' ? 10 : 1)).toString(16).padStart(64, '0'), symbol: kind === 'token' ? 'Crypto.AAPLX/USD' : 'Equity.US.AAPL/USD',
    kind, quoteCurrency: 'USD', unitBasis: kind === 'token' ? 'unverified-token-unit' : 'underlying-share',
    price, confidence: '10', exponent: -2, publishTime, publishedAt: new Date(publishTime * 1000).toISOString(), fetchedAt, expiresAt, state,
    displayPrice: pythDecimal(price, -2), displayConfidence: '0.1', confidenceBps: pythConfidenceBps(price, '10'),
  });
  return { source: 'pyth', state: age >= 60 ? 'stale' : 'success', fetchedAt, expiresAt, items: mints.map((mint, index) => ({ mint, state: age >= 60 ? 'stale' : 'success', underlying: observation(index, 'underlying'), token: observation(index, 'token'), comparison: 'not-comparable' })) };
}

async function setup(page: Page) {
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets, unavailable: [] } }));
  await page.route('**/api/quotes', async route => {
    const { items } = route.request().postDataJSON();
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({ json: { state: 'success', quotes: items.map((item: { mint: string; usdcRaw: string }) => ({ ...item, state: 'success', outRaw: '123000000', units: '1.23', fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString(), source: 'Controlled Jupiter fixture' })) } });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Apply illustrative split', exact: true }).click();
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.locator('.results-table td[data-label="Estimated +units"]')).toHaveText(['+1.23', '+1.23', '+1.23']);
}

test('Live references show confidence and original feed times while estimates retain their own amounts', async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route('**/api/market-reference', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    await route.fulfill({ json: references(body.mints, Date.now()) });
  });
  await setup(page);
  await expect(panel(page).getByText('Fresh reference', { exact: true })).toHaveCount(6);
  await expect(panel(page).getByText('Reported confidence ±$0.1', { exact: true })).toHaveCount(6);
  await expect(panel(page).getByText('Token feed · unit basis unverified', { exact: true })).toHaveCount(3);
  await panel(page).getByText('Feed identity', { exact: true }).first().click();
  await expect(panel(page).locator('code').first()).toBeVisible();
  expect(bodies).toEqual([{ mints: assets.map(asset => asset.mint).sort() }]);
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(3);
});

test('missing Pyth access leaves Jupiter estimates and export usable without invented prices', async ({ page }) => {
  await page.route('**/api/market-reference', route => route.fulfill({ status: 503, json: { source: 'pyth', state: 'configuration-required', fetchedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), items: [] } }));
  await setup(page);
  await expect(panel(page).getByText(/Pyth market data is currently unavailable/)).toBeVisible();
  await expect(panel(page).getByText('Fresh reference', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(3);
});

test('refreshing a stale oracle observation cannot renew a thirty-second quote', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  let reads = 0;
  await page.route('**/api/market-reference', async route => {
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({ json: references(route.request().postDataJSON().mints, now, '20000', ++reads === 1 ? 61 : 0) });
  });
  await setup(page);
  await expect(panel(page).getByText('Stale reference', { exact: true })).toHaveCount(6);
  await page.clock.fastForward(31_000);
  await panel(page).getByRole('button', { name: 'Refresh market references' }).click();
  await expect(panel(page).getByText('Fresh reference', { exact: true })).toHaveCount(6);
  await expect(panel(page).getByText(/Your contribution estimate expired/)).toBeVisible();
  expect(reads).toBe(2);
});

test('an old reference response cannot appear over a newly edited contribution', async ({ page }) => {
  let release: (() => void) | undefined;
  let reads = 0;
  await page.route('**/api/market-reference', async route => {
    const first = ++reads === 1;
    if (first) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: references(route.request().postDataJSON().mints, Date.now(), first ? '99900' : '22200') });
  });
  await setup(page);
  await expect.poll(() => typeof release).toBe('function');
  await page.getByLabel('USDC budget').fill('200');
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: /^(Get|Refresh) estimates$/ }).click();
  await expect(panel(page).getByText('$222 USD', { exact: true })).toHaveCount(6);
  release!();
  await expect(panel(page).getByText('$999 USD', { exact: true })).toHaveCount(0);
});

test('unrequested mint data is rejected without disturbing valid quote amounts', async ({ page }) => {
  await page.route('**/api/market-reference', route => route.fulfill({ json: references([EXAMPLE_ASSETS[3].mint], Date.now()) }));
  await setup(page);
  await expect(panel(page).getByText(/could not be verified/)).toBeVisible();
  await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(3);
});

test('Example mode never requests Pyth prices', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/market-reference', route => { reads += 1; return route.abort(); });
  await page.goto('/app?mode=example');
  await page.getByLabel('USDC budget').fill('10.000001');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  expect(reads).toBe(0);
});

test('reference details fit a 320px screen and pass accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.route('**/api/market-reference', route => route.fulfill({ json: references(route.request().postDataJSON().mints, Date.now()) }));
  await setup(page);
  await expect(panel(page).getByText('Fresh reference', { exact: true })).toHaveCount(6);
  await panel(page).getByText('Feed identity', { exact: true }).first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).include('[data-market-reference]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target).join(';')}`)).toEqual([]);
  if (process.env.LOTLINE_CAPTURE_SPONSORS === '1') {
    await mkdir('docs/releases/2026-09-21/screens', { recursive: true });
    await panel(page).screenshot({ path: 'docs/releases/2026-09-21/screens/pyth-320.png' });
  }
});
