import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../e2e/test';

for (const width of [390, 768, 1024, 1440]) {
  test(`app navigation is clear and fits at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/portfolio');
    const header = page.getByRole('navigation', { name: 'Main navigation' });
    const tabs = page.getByRole('navigation', { name: 'Planning sections' });
    const navigation = width <= 800 ? tabs : header;
    await expect(navigation.getByRole('link', { name: 'Portfolio', exact: true })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Portfolio', 'Markets', 'Community']) await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
    if (width <= 800) {
      await expect(tabs.getByRole('button', { name: /Start or extend a plan/ })).toContainText('Plan');
      await expect(header.getByRole('link', { name: 'Planner', exact: true })).toBeHidden();
    } else {
      await expect(header.getByRole('link', { name: 'Planner', exact: true })).toHaveAttribute('href', '/app');
      await expect(tabs).toBeHidden();
    }
    const controls = await navigation.locator('a, button').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { label: element.textContent, x: rect.x, right: rect.right, width: rect.width, height: rect.height };
    }).filter(rect => rect.width > 0 && rect.height > 0));
    expect(controls.filter(rect => rect.height < 44 || rect.x < 0 || rect.right > width)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include('.site-header').include('[data-app-tab-bar]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`navigation-${width}.png`) });
  });
}

test('desktop destinations stay available across Markets and the PreStocks planner', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.route('**/api/markets', route => route.fulfill({ status: 503, json: { state: 'unavailable', message: 'Snapshot is unavailable.' } }));
  await page.goto('/markets');
  const header = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(header.getByRole('link', { name: 'Community', exact: true })).toHaveAttribute('href', '/plans');
  await expect(header.getByRole('link', { name: 'Markets', exact: true })).toHaveAttribute('aria-current', 'page');
  await header.getByRole('link', { name: 'Pre-IPO', exact: true }).click();
  await expect(page).toHaveURL(/\/pre-ipo$/);
  await expect(header.getByRole('link', { name: 'Pre-IPO', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(header.getByRole('link', { name: 'Community', exact: true })).toHaveAttribute('href', '/plans');
  await header.getByRole('link', { name: 'Planner', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(header.getByRole('link', { name: 'Planner', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('the tablet plan menu supports keyboard dismissal and keeps Community on Pre-IPO', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 960 });
  await page.goto('/pre-ipo');
  const tabs = page.getByRole('navigation', { name: 'Planning sections' });
  await expect(tabs.getByRole('link', { name: 'Community', exact: true })).toHaveAttribute('href', '/plans');
  await expect(tabs.getByRole('link', { name: 'Portfolio', exact: true })).toHaveAttribute('aria-current', 'page');
  const create = tabs.getByRole('button', { name: /Start or extend a plan/ });
  await create.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Start or extend a plan' });
  await expect(sheet).toBeVisible();
  await expect(create).toHaveAttribute('aria-expanded', 'true');
  await expect(sheet.getByRole('link', { name: /Open your planner/ })).toHaveAttribute('href', '/app');
  await expect(sheet.getByRole('link', { name: /Plan with PreStocks/ })).toHaveAttribute('href', '/pre-ipo');
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await expect(create).toHaveAttribute('aria-expanded', 'false');
  await expect(create).toBeFocused();
});
