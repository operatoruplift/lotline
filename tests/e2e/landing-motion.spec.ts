import { expect, test } from './test';

for (const width of [390, 1440]) {
  test(`native scrolling adds restrained depth and keeps the plan usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const landing = page.locator('[data-landing-motion]');
    const layer = landing.locator('[data-scroll-layer="54"]');
    await expect.poll(() => layer.evaluate(node => node.style.getPropertyValue('--scroll-y'))).not.toBe('');
    await expect.poll(() => page.getByRole('main').getByRole('link', { name: 'Make a plan', exact: true }).evaluate(node => Number(getComputedStyle(node.parentElement!).opacity))).toBe(1);
    await page.screenshot({ path: test.info().outputPath(`landing-hero-${width}.png`) });
    const before = await layer.evaluate(node => getComputedStyle(node).transform);
    await page.mouse.wheel(0, 320);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
    await expect.poll(() => layer.evaluate(node => getComputedStyle(node).transform)).not.toBe(before);
    const shift = await layer.evaluate(node => Math.abs(parseFloat(node.style.getPropertyValue('--scroll-y'))));
    expect(shift).toBeLessThanOrEqual(width <= 800 ? 19 : 54);

    const catalog = page.getByRole('link', { name: 'Explore the catalog' });
    await catalog.scrollIntoViewIfNeeded();
    const reveal = catalog.locator('xpath=ancestor::*[@data-reveal][1]');
    await expect.poll(() => reveal.evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1);
    // Keyboard focus must expose content immediately, even during its entrance.
    await catalog.focus();
    await expect(catalog).toBeFocused();
    expect(await reveal.evaluate(node => ({ opacity: getComputedStyle(node).opacity, filter: getComputedStyle(node).filter }))).toEqual({ opacity: '1', filter: 'none' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`landing-features-${width}.png`) });
    await catalog.press('Enter');
    await expect(page.getByLabel('USDC budget')).toBeVisible();
    await expect(landing).toHaveCount(0);
  });
}

test('changing motion preference resets scroll depth without hiding content', async ({ page }) => {
  await page.goto('/');
  const layer = page.locator('[data-landing-motion] [data-scroll-layer="54"]');
  await expect.poll(() => layer.evaluate(node => node.style.getPropertyValue('--scroll-y'))).not.toBe('');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => layer.evaluate(node => getComputedStyle(node).transform)).toBe('none');
  await expect.poll(() => layer.evaluate(node => node.style.getPropertyValue('--scroll-y'))).toBe('');
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  expect(await page.locator('[data-reveal]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === '1'))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => layer.evaluate(node => node.style.getPropertyValue('--scroll-y'))).not.toBe('');
});

test('JavaScript-disabled browsers receive a clear instruction instead of an endless loader', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  try {
    await page.goto(baseURL!);
    await expect(page.getByRole('heading', { name: 'JavaScript is turned off.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Opening Lotline…' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Reload Lotline' })).toHaveAttribute('href', '/');
  } finally { await context.close(); }
});

test('server content and links remain usable when client bundles cannot load', async ({ browser, baseURL }) => {
  test.skip(process.env.E2E_PRODUCTION !== 'true', 'Next development CSS requires client bundles; verify progressive enhancement on the production output.');
  const context = await browser.newContext({ reducedMotion: 'no-preference' });
  const page = await context.newPage();
  try {
    // Permit Next's inline stream swap, but deny hydration and animation bundles.
    await page.route('**/_next/static/**/*.js*', route => route.abort());
    await page.goto(baseURL!);
    await expect(page.getByRole('heading', { name: 'Your next contribution, clearly.' })).toBeVisible();
    await page.getByRole('link', { name: 'Explore the catalog' }).scrollIntoViewIfNeeded();
    expect(await page.locator('[data-reveal]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === '1'))).toBe(true);
    await expect(page.getByRole('link', { name: 'Watch demo' })).toHaveAttribute('href', '/demo');
    await expect(page.locator('video[src]')).toHaveCount(0);
  } finally { await context.close(); }
});
