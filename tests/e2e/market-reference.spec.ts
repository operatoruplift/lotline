import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';
import { PYTH_FEED_MAPPINGS, PYTH_USDC_FEED_ID, pythConfidenceBps } from '../../lib/domain/market-reference';
import { pythReferences as references } from '../fixtures/pyth';
import { mkdir } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });
const assets = EXAMPLE_ASSETS.slice(0, 3);
const panel = (page: Page) => page.locator('[data-market-reference]');

async function setup(page: Page, withScaling = false) {
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets, unavailable: [] } }));
  await page.route('**/api/quotes', async route => {
    const { items } = route.request().postDataJSON();
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({ json: { state: 'success', quotes: items.map((item: { mint: string; usdcRaw: string }) => ({ ...item, state: 'success', outRaw: '123000000', units: '1.23', fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString(), source: 'Controlled Jupiter fixture', ...(withScaling ? { unitContext: { kind: 'scaled', source: 'clock-sysvar', tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', decimals: 8, mintSlot: 42, clockSlot: 42, unixTimestamp: String(Math.floor(now / 1000)), observedAt: new Date(now).toISOString(), multiplier: 1 } } : {}) })) } });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Apply illustrative split', exact: true }).click();
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.locator('.results-table td[data-label="Estimated +units"]')).toHaveText(['+1.23', '+1.23', '+1.23']);
}

test('a planning benchmark uses USDC conversion and disappears when that observation expires', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  // Freeze wall time without pausing the timers used by accessibility scanning.
  const testTime = Date.now();
  await page.clock.setFixedTime(new Date(testTime));
  await page.route('**/api/market-reference', async route => {
    const now = await page.evaluate(() => Date.now());
    const data = references(route.request().postDataJSON().mints, now);
    const publishTime = Math.floor(now / 1000) - 58;
    data.usdc = { ...data.items[0].underlying!, feedId: PYTH_USDC_FEED_ID, symbol: 'Crypto.USDC/USD', kind: 'currency', unitBasis: 'usdc-unit', price: '98000000', confidence: '10000', exponent: -8, displayPrice: '0.98', displayConfidence: '0.0001', confidenceBps: pythConfidenceBps('98000000', '10000'), publishTime, publishedAt: new Date(publishTime * 1000).toISOString(), expiresAt: new Date((publishTime + 60) * 1000).toISOString() };
    await route.fulfill({ json: data });
  });
  await setup(page, true);
  await expect(panel(page).locator('[data-quote-benchmark]')).toHaveCount(3);
  await expect(panel(page).locator('[data-quote-benchmark]').first()).toContainText('USDC/USD 0.98');
  await expect(panel(page).locator('[data-quote-benchmark]').first()).toContainText('not the later purchase order');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).include('[data-market-reference]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations.map(item => item.id)).toEqual([]);
  if (process.env.LOTLINE_CAPTURE_BENCHMARK === '1') {
    // The estimate notice clears itself, so the screenshot waits it out instead of
    // clicking a control that may already be gone.
    await expect(page.locator('.toast.visible')).toHaveCount(0, { timeout: 20_000 });
    await panel(page).getByRole('button', { name: 'Refresh market references' }).focus();
    await mkdir('docs/releases/2026-09-23/screens', { recursive: true });
    await panel(page).screenshot({ path: 'docs/releases/2026-09-23/screens/quote-benchmark-320.png' });
  }
  await page.clock.setFixedTime(new Date(testTime + 3_000));
  await expect(panel(page).locator('[data-quote-benchmark]')).toHaveCount(0);
  await expect(panel(page).locator('[data-currency-reference]')).toContainText('Stale reference');
  await expect(panel(page).locator('[data-benchmark-unavailable]').first()).toContainText('Fresh equity and USDC/USD references');
  await expect(page.locator('.results-table td[data-label="Estimated +units"]')).toHaveText(['+1.23', '+1.23', '+1.23']);
});

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
  await expect(panel(page).locator('[data-reference-comparison]')).toHaveCount(3);
  await expect(panel(page).locator('[data-reference-comparison]').first()).toContainText('approximately 1×');
  await panel(page).getByText('Feed identity', { exact: true }).first().click();
  await expect(panel(page).locator('code').first()).toBeVisible();
  await expect(panel(page).locator('code').first()).toHaveText(PYTH_FEED_MAPPINGS[0].underlying);
  expect(bodies).toEqual([{ mints: assets.map(asset => asset.mint).sort() }]);
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(3);
});

test('a displayed ratio disappears at the original feed expiry without a refresh', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  let reads = 0;
  await page.route('**/api/market-reference', async route => {
    reads += 1;
    await route.fulfill({ json: references(route.request().postDataJSON().mints, await page.evaluate(() => Date.now()), '20000', 58) });
  });
  await setup(page);
  await expect(panel(page).locator('[data-reference-comparison]')).toHaveCount(3);
  await page.clock.fastForward(3_000);
  await expect(panel(page).getByText('Stale reference', { exact: true })).toHaveCount(6);
  await expect(panel(page).locator('[data-reference-comparison]')).toHaveCount(0);
  expect(reads).toBe(1);
});

test('a reference panel with nothing verified claims nothing and leaves estimates and export usable', async ({ page }) => {
  // The route answers 200 for a deliberate off state: the body is a determination.
  await page.route('**/api/market-reference', route => route.fulfill({ status: 200, json: { source: 'pyth', state: 'configuration-required', fetchedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), items: [] } }));
  await setup(page);
  await expect(panel(page).getByText(/no reference price is claimed for it/)).toBeVisible();
  await expect(panel(page).locator('[data-reference-mint]')).toHaveCount(0);
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

test('the panel re-reads its own references inside the sixty-second observation window', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  let reads = 0;
  await page.route('**/api/market-reference', async route => {
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({ json: references(route.request().postDataJSON().mints, now, '20000', ++reads === 1 ? 61 : 0) });
  });
  await setup(page);
  await expect(panel(page).getByText('Stale reference', { exact: true })).toHaveCount(6);
  // No click: the panel re-reads before an observation has been stale for long.
  await page.clock.fastForward(56_000);
  await expect(panel(page).getByText('Fresh reference', { exact: true })).toHaveCount(6);
  expect(reads).toBe(2);
  // A refreshed reference still cannot renew the thirty-second contribution estimate.
  await expect(panel(page).getByText(/Your contribution estimate expired/)).toBeVisible();
});

test('a tab nobody is looking at reads nothing and re-reads once it is looked at again', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  let reads = 0;
  await page.route('**/api/market-reference', async route => {
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({ json: references(route.request().postDataJSON().mints, now, '20000', ++reads === 1 ? 61 : 0) });
  });
  await setup(page);
  await expect(panel(page).getByText('Stale reference', { exact: true })).toHaveCount(6);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(180_000);
  // Nothing is read for a panel nobody can see, however long the tab sits there.
  expect(reads).toBe(1);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(panel(page).getByText('Fresh reference', { exact: true })).toHaveCount(6);
  expect(reads).toBe(2);
  // The returning reader still gets the truth about their own contribution estimate.
  await expect(panel(page).getByText(/Your contribution estimate expired/)).toBeVisible();
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
