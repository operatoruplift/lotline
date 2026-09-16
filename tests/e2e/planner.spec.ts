import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('Example journey: edit, request, export, persist, and safely hand off', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: /try the example/i }).first().click();
  await page.waitForURL('**/app?mode=example', { timeout: 60_000 });
  await expect(page.getByLabel('USDC budget')).toBeVisible();
  await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
  await expect(page.getByLabel('MSFTx percentage')).toHaveValue('30');
  await expect(page.getByLabel('NVDAx percentage')).toHaveValue('20');
  await page.getByLabel('USDC budget').fill('10.000001');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Copy plan', exact: true }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('10.000001');
  expect(clipboard).toContain('Review on Jupiter before trading');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloaded;
  const file = await download.path();
  expect(file).toBeTruthy();
  const csv = await readFile(file!, 'utf8');
  expect(csv).toContain('5.000001');
  expect(csv).toContain('3.000000');
  expect(csv).toContain('2.000000');
  expect(csv).toContain('AAPLx');
  expect(csv.toLowerCase()).toContain('example');
  expect(csv).toContain('Review on Jupiter before trading');
  expect(csv).toContain('XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp');
  await page.reload();
  await expect(page.getByLabel('USDC budget')).toHaveValue('10.000001');
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const jupiter = page.locator('a[href*="jup.ag"]');
  expect(await jupiter.count()).toBeGreaterThan(0);
  for (const link of await jupiter.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const url = new URL((await link.getAttribute('href'))!);
    // The legacy `/swap/USDC-<mint>` path form redirects to buy=SOL, silently
    // replacing the planned asset. Only the query form preserves the mint.
    expect(url.pathname).toBe('/swap');
    expect(url.searchParams.get('sell')).toBe(USDC);
  }
  // Each leg links out with its own verified mint and its exact allocation.
  const perAsset = page.locator('a.handoff-review');
  await expect(perAsset).toHaveCount(3);
  const prefilled = await Promise.all((await perAsset.all()).map(async link => {
    const url = new URL((await link.getAttribute('href'))!);
    return `${url.searchParams.get('buy')}:${url.searchParams.get('inAmount')}`;
  }));
  expect(prefilled).toEqual([
    'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp:5.000001',
    'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX:3',
    'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh:2',
  ]);
  expect(pageErrors).toEqual([]);
});

test('invalid weights and overprecision are actionable', async ({ page }) => {
  await page.goto('/app?mode=example');
  await page.getByLabel('AAPLx percentage').fill('49');
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  await expect(page.getByText(/100%/).first()).toBeVisible();
  await page.getByLabel('AAPLx percentage').fill('50');
  await page.getByLabel('USDC budget').fill('0.0000001');
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeDisabled();
  await page.getByLabel('USDC budget').fill('0.000001');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
});

test('core planner is usable by keyboard', async ({ page }) => {
  await page.goto('/app?mode=example');
  await expect(page.getByLabel('USDC budget')).toBeVisible();
  // Navigate only with keys from the document start, including field edits and submit.
  await page.keyboard.press('Tab');
  let reachedBudget = false;
  for (let i = 0; i < 50; i++) {
    const activeLabel = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement;
      return el?.labels?.[0]?.textContent ?? el?.getAttribute('aria-label') ?? '';
    });
    if (activeLabel.includes('USDC budget')) { reachedBudget = true; break; }
    await page.keyboard.press('Tab');
  }
  expect(reachedBudget).toBe(true);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('125');
  let reachedAction = false;
  for (let i = 0; i < 50; i++) {
    const text = await page.evaluate(() => document.activeElement?.textContent ?? '');
    if (text.includes('Get estimates')) { reachedAction = true; break; }
    await page.keyboard.press('Tab');
  }
  expect(reachedAction).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
});

for (const width of [375, 768, 1440]) {
  test(`responsive and accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/', '/app?mode=example', '/how-it-works']) {
      await page.goto(route);
      if (route.includes('/app')) await expect(page.getByLabel('USDC budget')).toBeVisible();
      // Assess the completed entrance; media tests cover motion and pause behavior.
      const header = page.getByRole('banner');
      await expect(header).toHaveCount(1);
      await expect(header.locator(':scope > div')).toHaveCSS('opacity', '1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(',')).join('; ')}`)).toEqual([]);
    }
  });
}

test('maximum-precision budgets fit inside the mobile summary panel', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/app?mode=example');
  await page.getByLabel('USDC budget').fill('999999.999999');
  const fits = await page.locator('.contribution-summary').evaluate(panel => {
    const parent = panel.getBoundingClientRect();
    return [...panel.children].every(child => {
      const rect = child.getBoundingClientRect();
      return rect.width === 0 || (rect.left >= parent.left && rect.right <= parent.right + 1);
    });
  });
  expect(fits).toBe(true);
});

test('create a three-asset split and export using keyboard controls', async ({ page }) => {
  await page.route('**/api/assets', route => route.fulfill({ status: 503, json: { state: 'configuration-required', assets: [], unavailable: [], message: 'Example mode is ready to use.' } }));
  await page.goto('/app?mode=example');
  await expect(page.getByLabel('USDC budget')).toBeVisible();
  async function tabTo(name: string) {
    for (let count = 0; count < 65; count++) {
      const activeName = await page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement;
        return el?.getAttribute('aria-label') ?? el?.labels?.[0]?.textContent?.trim() ?? el?.textContent?.trim() ?? '';
      });
      if (activeName === name) return;
      await page.keyboard.press('Tab');
    }
    throw new Error(`Could not reach ${name} with the Tab key.`);
  }
  for (const symbol of ['AAPLx', 'MSFTx', 'NVDAx']) {
    await tabTo(`Remove ${symbol}`);
    await page.keyboard.press('Enter');
  }
  for (let i = 0; i < 3; i++) {
    await tabTo('Add an asset');
    await page.keyboard.press('Enter');
    await tabTo('Choose an example xStock');
    // Native select typeahead works across desktop platforms without relying on popup-menu key semantics.
    await page.keyboard.type(['AAPLx', 'MSFTx', 'NVDAx'][i]);
    await page.keyboard.press('Tab');
  }
  for (const [symbol, weight] of [['AAPLx', '50'], ['MSFTx', '30'], ['NVDAx', '20']]) {
    await tabTo(`${symbol} percentage`);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(weight);
  }
  await tabTo('Get estimates');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  await tabTo('Download CSV');
  const downloaded = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await downloaded;
  expect(download.suggestedFilename()).toContain('lotline-example-plan');
});
