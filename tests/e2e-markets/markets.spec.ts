import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../e2e/test';
import { MARKET_IDENTITIES, type ChartResponse, type MarketSnapshot } from '../../lib/domain/markets';
import { XSTOCK_REGISTRY } from '../../lib/domain/assets';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import { buildPlanLink } from '../../lib/domain/share';
import { DEFAULT_BASKET, EXAMPLE_ASSETS, getExampleHoldings } from '../../lib/demo/example';

const AAPLX = MARKET_IDENTITIES.find(identity => identity.symbol === 'AAPLx')!;
const SPYX = MARKET_IDENTITIES.find(identity => identity.symbol === 'SPYx')!;
const NVDAX = MARKET_IDENTITIES.find(identity => identity.symbol === 'NVDAx')!;
const OPENAI = MARKET_IDENTITIES.find(identity => identity.symbol === 'OPENAI')!;
const FETCHED = new Date(Date.now() - 60_000).toISOString();
const snapshot: MarketSnapshot = {
  state: 'success', source: 'Jupiter Tokens API', fetchedAt: FETCHED, missing: MARKET_IDENTITIES.length - 3, stats: {
    [AAPLX.mint]: { price: 340.45, change24hPct: 0.17, volume24hUsd: 601_782, liquidityUsd: 590_605, marketCapUsd: 52_519_815, holders: 34_706, updatedAt: FETCHED },
    [SPYX.mint]: { price: 661.2, change24hPct: -1.25, volume24hUsd: 2_450_000, liquidityUsd: 3_100_000, marketCapUsd: 120_000_000, holders: 51_000, updatedAt: FETCHED },
    [NVDAX.mint]: { price: 181.9, change24hPct: 2.4, volume24hUsd: 900_000, liquidityUsd: 800_000, marketCapUsd: 90_000_000, holders: 40_000, updatedAt: FETCHED },
  },
};
const chart = (mint: string, range: string): ChartResponse => ({
  state: 'success', mint, range: range as ChartResponse['range'], source: 'GeckoTerminal', fetchedAt: FETCHED, pool: { address: 'CKwJZwm7oj3nu4653N1EpDrqXbXAYXoPFiPeEnLouF8y', name: 'AAPLx / USDC' },
  points: Array.from({ length: 24 }, (_, index) => ({ t: Date.now() - (24 - index) * 3_600_000, c: 330 + index * 0.5 })),
});
const catalog = XSTOCK_REGISTRY.map(asset => ({ ...asset, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', halted: false, verifiedAt: new Date().toISOString() }));

async function mockMarkets(page: Page, response: { status?: number; json: unknown } = { json: snapshot }) {
  const requests: string[] = [];
  await page.route('**/api/markets', route => { requests.push(route.request().url()); return route.fulfill({ status: response.status ?? 200, json: response.json }); });
  await page.route('**/api/markets/chart?**', route => { const url = new URL(route.request().url()); return route.fulfill({ json: chart(url.searchParams.get('mint')!, url.searchParams.get('range')!) }); });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: catalog, unavailable: [] } }));
  return requests;
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('browsing, sorting, searching and adding keeps the snapshot labelled and the draft intact', async ({ page }) => {
  await mockMarkets(page);
  await page.goto('/markets');
  await expect(page.getByRole('heading', { level: 1, name: 'Find what goes in your next contribution.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Snapshot from Jupiter at' })).toContainText('not a quote');
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toContainText('SPYx');
  await expect(rows.nth(1)).toContainText('NVDAx');
  await expect(page.getByText(`1–20 of ${MARKET_IDENTITIES.length}`)).toBeVisible();
  await page.getByRole('button', { name: /^ETFs/ }).click();
  await expect(page).toHaveURL(/category=etfs/);
  await expect(rows.first()).toContainText('SPYx');
  await expect(page.getByText('1–20 of 54')).toBeVisible();
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByLabel('Sort').selectOption('gainers');
  await expect(rows.first()).toContainText('NVDAx');
  await page.getByLabel('Search markets').fill('apple');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('$340.45');
  await expect(rows.first()).toContainText('+0.17%');

  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, budget: '250', items: [{ mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', percent: '60' }] })), BASKET_STORAGE_KEY);
  await page.getByRole('button', { name: 'Add AAPLx to your plan' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'AAPLx added to your plan at 40%' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AAPLx is in your plan' })).toBeDisabled();
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key)!, BASKET_STORAGE_KEY))).toEqual({ version: 1, budget: '250', items: [{ mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', percent: '60' }, { mint: AAPLX.mint, percent: '40' }] });
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('the asset sheet shows dated context and identity, charts each range, and adds from the sheet', async ({ page }) => {
  await mockMarkets(page);
  await page.goto(`/markets?asset=${AAPLX.mint}`);
  const sheet = page.getByRole('dialog', { name: 'Apple xStock' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('$340.45');
  await expect(sheet.getByRole('img', { name: /Price over the last day/ })).toBeVisible();
  await expect(sheet).toContainText('GeckoTerminal · pool AAPLx / USDC');
  await expect(sheet).toContainText(AAPLX.mint);
  await expect(sheet).toContainText('AAPL · US listing');
  await expect(sheet).toContainText('Not a quote');
  await sheet.getByRole('button', { name: '7D' }).click();
  await expect(sheet.getByRole('img', { name: /Price over the last 7 days/ })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await sheet.getByRole('button', { name: 'Add to plan' }).click();
  await expect(sheet.getByRole('button', { name: 'In your plan' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/asset=/);
  await page.getByRole('button', { name: 'SPYx, SP500 xStock. Open details' }).click();
  await expect(page.getByRole('dialog', { name: 'SP500 xStock' })).toContainText('ETF per Nasdaq’s symbol directory');
});

test('metals and bonds filters, leverage notes, and switching versions keep the sheet open', async ({ page }) => {
  const bySymbol = (symbol: string) => MARKET_IDENTITIES.find(identity => identity.symbol === symbol)!;
  await mockMarkets(page);
  await page.goto('/markets');
  const rows = page.locator('tbody tr');
  await page.getByRole('button', { name: /^Metals/ }).click();
  await expect(page).toHaveURL(/category=metals/);
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'GLDx' })).toContainText('Metal ETF');
  await page.getByRole('button', { name: /^Bonds/ }).click();
  await expect(rows).toHaveCount(6);
  await expect(rows.filter({ hasText: 'SGOVx' })).toContainText('Bond ETF');

  await page.goto(`/markets?asset=${bySymbol('TQQQx').mint}`);
  const leveraged = page.getByRole('dialog', { name: 'TQQQ xStock' });
  await expect(leveraged).toContainText('xStocks · 3× daily ETF');
  await expect(leveraged.getByRole('note')).toContainText('Seeks 3× of one day’s move');
  await expect(leveraged.getByRole('heading', { name: 'Similar exposure · Nasdaq-100' })).toBeVisible();
  await leveraged.getByRole('button', { name: /^Open QQQx/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nasdaq xStock' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`asset=${bySymbol('QQQx').mint}`));

  await page.goto(`/markets?asset=${bySymbol('SPACEX').mint}`);
  const company = page.getByRole('dialog', { name: 'SpaceX PreStocks' });
  await expect(company.getByRole('heading', { name: 'Other ways to hold SpaceX' })).toBeVisible();
  await company.getByRole('button', { name: /^Open SPCXx/ }).click();
  const xstock = page.getByRole('dialog', { name: 'SpaceX xStock' });
  await expect(xstock).toBeVisible();
  await expect(xstock.getByRole('button', { name: /^Open SPACEX/ })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('an unavailable snapshot still lets people browse identities and add assets', async ({ page }) => {
  await mockMarkets(page, { status: 503, json: { state: 'unavailable', message: 'Market data is temporarily unavailable.' } });
  await page.goto('/markets?category=pre-ipo');
  await expect(page.getByRole('status').filter({ hasText: 'Market data is temporarily unavailable.' })).toContainText('adding to a plan still work');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('button', { name: 'Add OPENAI to your plan' }).click();
  await expect(page.getByRole('link', { name: 'Open plan' })).toHaveAttribute('href', '/pre-ipo');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('lotline:prestocks:basket:v1')!)).items).toEqual([{ mint: OPENAI.mint, percent: '100' }]);
});

test('an add link is reviewed before the planner changes, and foreign assets are refused', async ({ page }) => {
  await mockMarkets(page);
  await page.addInitScript(key => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, JSON.stringify({ version: 1, budget: '500', items: [{ mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', percent: '100' }] })); sessionStorage.setItem('seeded', '1'); } }, BASKET_STORAGE_KEY);
  await page.goto(`/app?add=${NVDAX.mint}`);
  const review = page.getByRole('dialog', { name: 'Add NVDAx to your plan?' });
  await expect(review).toContainText('It joins your draft at 0%');
  await expect(review).toContainText('Nothing is bought');
  await review.getByRole('button', { name: 'Not now' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key)!, BASKET_STORAGE_KEY)).items).toHaveLength(1);
  await page.goto(`/app?add=${NVDAX.mint}`);
  await page.getByRole('dialog', { name: 'Add NVDAx to your plan?' }).getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByLabel('NVDAx percentage')).toHaveValue('0');
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key)!, BASKET_STORAGE_KEY)).items.map((item: { mint: string }) => item.mint)).toEqual(['XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', NVDAX.mint]);
  await page.goto(`/app?add=${OPENAI.mint}`);
  await expect(page.getByRole('dialog', { name: 'This asset link can’t be used here' })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`phone navigation at ${width}px opens the plan sheet, validates links and fits the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockMarkets(page);
    await page.goto('/markets');
    const bar = page.getByRole('navigation', { name: 'Planning sections' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Markets' })).toHaveAttribute('aria-current', 'page');
    expect(await noOverflow(page)).toBe(true);
    const small = await page.locator('main button, main input, main select, nav[aria-label="Planning sections"] a, nav[aria-label="Planning sections"] button').evaluateAll(elements => elements.filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43; }).map(element => element.getAttribute('aria-label') ?? element.textContent));
    expect(small).toEqual([]);
    await bar.getByRole('button', { name: /Start or extend a plan/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Start or extend a plan' });
    await sheet.getByRole('button', { name: /Open a plan link/ }).click();
    await sheet.getByLabel('Plan link').fill('https://evil.example/app#plan=abc');
    await sheet.getByRole('button', { name: 'Review this plan' }).click();
    await expect(sheet.getByRole('alert')).toContainText('Paste a Lotline plan link');
    const link = buildPlanLink(new URL(page.url()).origin, { version: 1, budget: '75', items: [{ mint: AAPLX.mint, percent: '100' }] }, 'live');
    await sheet.getByLabel('Plan link').fill(link);
    await sheet.getByRole('button', { name: 'Review this plan' }).click();
    await expect(page.getByRole('dialog', { name: 'Review shared plan' })).toBeVisible();
    // The planner lives under the Portfolio tab.
    await expect(page.getByRole('navigation', { name: 'Planning sections' }).getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
  });
}

test('balancing toward the split suggests a no-sell contribution and restores the target on request', async ({ page }) => {
  const [first, second, third] = DEFAULT_BASKET.items.map(item => item.mint);
  const holdings = getExampleHoldings([first, second, third]);
  holdings.state = 'success';
  holdings.holdings = [{ mint: first, state: 'success', raw: '6', units: '6' }, { mint: second, state: 'success', raw: '0', units: '0' }, { mint: third, state: 'success', raw: '0', units: '0' }];
  const prices: MarketSnapshot = { ...snapshot, stats: { [first]: { ...snapshot.stats[AAPLX.mint], price: 250 }, [second]: { ...snapshot.stats[AAPLX.mint], price: 400 }, [third]: { ...snapshot.stats[AAPLX.mint], price: 180 } } };
  await page.addInitScript(({ key, basket }) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, JSON.stringify(basket)); sessionStorage.setItem('seeded', '1'); } }, { key: BASKET_STORAGE_KEY, basket: DEFAULT_BASKET });
  await page.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS, unavailable: [] } }));
  await page.route('**/api/markets', route => route.fulfill({ json: prices }));
  await page.route('**/api/holdings?**', route => route.fulfill({ json: holdings }));
  await page.goto('/app');
  await page.getByLabel('Wallet address', { exact: true }).fill('11111111111111111111111111111111');
  await page.getByRole('button', { name: 'Load balances', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Balance toward your split' });
  await expect(panel).toContainText('without selling anything');
  // 1,500 held in the first asset plus 1,000 new: targets 1,250 / 750 / 500, so the first asset is already over.
  const [a, b, c] = [EXAMPLE_ASSETS[0].symbol, EXAMPLE_ASSETS[1].symbol, EXAMPLE_ASSETS[2].symbol];
  await expect(panel.getByRole('row', { name: new RegExp(`^${a}`) })).toContainText('100%');
  await expect(panel.getByRole('row', { name: new RegExp(`^${b}`) }).locator('strong')).toHaveText('60%');
  await expect(panel.getByRole('row', { name: new RegExp(`^${c}`) }).locator('strong')).toHaveText('40%');
  await panel.getByRole('button', { name: /Use this split for this contribution/ }).click();
  await expect(page.getByLabel(`${a} percentage`)).toHaveValue('0');
  await expect(page.getByLabel(`${b} percentage`)).toHaveValue('60');
  await expect(page.getByLabel(`${c} percentage`)).toHaveValue('40');
  await expect(panel).toContainText('This contribution uses the suggested split.');
  await panel.getByRole('button', { name: 'Restore target split (50% / 30% / 20%)' }).click();
  await expect(page.getByLabel(`${a} percentage`)).toHaveValue('50');
  await expect(page.getByLabel(`${b} percentage`)).toHaveValue('30');
});
