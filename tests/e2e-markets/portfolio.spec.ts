import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../e2e/test';
import { MARKET_IDENTITIES, type MarketSnapshot } from '../../lib/domain/markets';
import { PLANNER_UNIVERSES } from '../../lib/domain/planner-universe';
import { REMINDER_STORAGE_KEY } from '../../lib/client/reminder';

const mint = (symbol: string) => MARKET_IDENTITIES.find(identity => identity.symbol === symbol)!.mint;
const FETCHED = new Date(Date.now() - 60_000).toISOString();
const figures = (price: number, change: number) => ({ price, change24hPct: change, volume24hUsd: 1_000, liquidityUsd: 10_000, marketCapUsd: 1_000_000, holders: 100, updatedAt: FETCHED });
const snapshot: MarketSnapshot = {
  state: 'success', source: 'Jupiter Tokens API', fetchedAt: FETCHED, missing: 0,
  stats: { [mint('AAPLx')]: figures(340.45, 0.17), [mint('SPYx')]: figures(661.2, -1.25), [mint('GLDx')]: figures(378.9, -3.47) },
};
const plan = (budget: string, items: [string, string][]) => ({ version: 1, budget, items: items.map(([symbol, percent]) => ({ mint: mint(symbol), percent })) });
const MIXED = plan('1000', [['AAPLx', '40'], ['SPYx', '25'], ['GLDx', '15'], ['SGOVx', '10'], ['TQQQx', '5'], ['NVDAx', '5']]);

async function seed(page: Page, entries: Record<string, unknown>) {
  await page.addInitScript(values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); }, entries);
  await page.route('**/api/markets', route => route.fulfill({ json: snapshot }));
}

test('with no plan, the portfolio home starts people off with tiles, steps and the community', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { level: 1, name: 'Start with one clear split.' })).toBeVisible();
  const tiles = page.getByRole('list', { name: 'Browse markets by type' });
  // Six types with crypto on, as this suite's server runs it.
  await expect(tiles.getByRole('link')).toHaveCount(6);
  await expect(tiles.getByRole('link', { name: /Crypto/ })).toHaveAttribute('href', '/markets?category=crypto');
  await expect(tiles.getByRole('link', { name: /Metals/ })).toHaveAttribute('href', '/markets?category=metals');
  await expect(tiles.getByRole('link', { name: /Bonds/ })).toContainText('6 verified');
  await expect(page.getByRole('list', { name: 'How it works' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('Lotline never buys or signs on its own.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Start from a community plan/ })).toHaveAttribute('href', '/plans');
  const bar = page.getByRole('navigation', { name: 'Planning sections' });
  await expect(bar.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
  await expect(bar.getByRole('link', { name: 'Community' })).toHaveAttribute('href', '/plans');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  // The network label must retain contrast during the entrance, not just after it.
  const sampledEntrance = await page.locator('.site-header > div').evaluate(node => {
    const animation = node.getAnimations().find(item => item instanceof CSSAnimation && item.animationName.includes('arrive'));
    const duration = animation?.effect?.getTiming().duration;
    if (!animation || typeof duration !== 'number' || duration <= 0) return false;
    animation.pause();
    animation.currentTime = duration / 2;
    return true;
  });
  expect(sampledEntrance).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('a saved plan shows its budget, type mix, exact amounts, today’s moves and the next review', async ({ page }) => {
  await seed(page, {
    [PLANNER_UNIVERSES.xstocks.storageKey]: MIXED,
    [REMINDER_STORAGE_KEY]: { id: 'reminder-1', basket: MIXED, mode: 'live', cadence: 'monthly', timezone: 'UTC', nextDueAt: '2026-10-01T09:00:00.000Z', paused: false, planVersion: 1 },
  });
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { level: 1, name: 'Your plan at a glance.' })).toBeVisible();
  const card = page.getByRole('region', { name: /1,000\.00 USDC/ });
  await expect(card).toContainText('Ready');
  await expect(card).toContainText('per contribution, split across 6 assets');
  const mix = card.getByRole('list', { name: 'Split by asset type' });
  await expect(mix).toContainText('Stocks 45%');
  await expect(mix).toContainText('Metals 15%');
  await expect(mix).toContainText('Bonds 10%');
  await expect(mix).toContainText('Leveraged ETFs 5%');
  const apple = card.getByRole('listitem').filter({ hasText: 'AAPLx' });
  await expect(apple).toContainText('40%');
  await expect(apple).toContainText('400.00 USDC');
  await expect(apple).toContainText('$340.45');
  await expect(apple).toContainText('+0.17%');
  await expect(card.getByRole('listitem').filter({ hasText: 'TQQQx' })).toContainText('3× daily ETF');
  await expect(card).toContainText('Prices are Jupiter’s market snapshot at');
  await expect(card).toContainText('Next review Thu 1 Oct, 09:00 (UTC), monthly.');
  await expect(card.getByRole('link', { name: /Review and get estimates/ })).toHaveAttribute('href', '/app');
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('an unfinished draft says what is missing, and a PreStocks draft gets its own card', async ({ page }) => {
  await seed(page, {
    [PLANNER_UNIVERSES.xstocks.storageKey]: plan('250', [['AAPLx', '60']]),
    [PLANNER_UNIVERSES.prestocks.storageKey]: plan('100', [['OPENAI', '100']]),
  });
  await page.goto('/portfolio');
  const draft = page.getByRole('region', { name: /250\.00 USDC/ });
  await expect(draft).toContainText('60% assigned');
  await expect(draft).toContainText('Set your contribution percentages to total exactly 100%.');
  await expect(draft.getByRole('link', { name: /Finish your split/ })).toHaveAttribute('href', '/app');
  await expect(draft).toContainText('No review reminder yet.');
  const prestocks = page.locator('[data-universe="prestocks"]');
  await expect(prestocks).toContainText('Your PreStocks plan');
  await expect(prestocks.getByRole('link', { name: 'Add assets' })).toHaveAttribute('href', '/markets?category=pre-ipo');
  await expect(prestocks.getByRole('link', { name: /Review and get estimates/ })).toHaveAttribute('href', '/pre-ipo');
});

test('the plus sheet opens the planner and keeps PreStocks reachable when Community takes its tab', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/portfolio');
  const bar = page.getByRole('navigation', { name: 'Planning sections' });
  await expect(bar.getByRole('link', { name: 'Pre-IPO' })).toHaveCount(0);
  await bar.getByRole('button', { name: /Start or extend a plan/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Start or extend a plan' });
  await expect(sheet.getByRole('link', { name: /Open your planner/ })).toHaveAttribute('href', '/app');
  await expect(sheet.getByRole('link', { name: /Plan with PreStocks/ })).toHaveAttribute('href', '/pre-ipo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
