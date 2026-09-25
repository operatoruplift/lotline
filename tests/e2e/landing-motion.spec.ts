import { expect, test } from './test';

for (const width of [390, 1440]) {
  test(`native scrolling keeps media anchored and the plan usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const hero = page.getByRole('main').locator('[data-decorative-video="Hero boomerang"]');
    await expect.poll(() => page.getByRole('main').getByRole('link', { name: 'Make a plan', exact: true }).evaluate(node => Number(getComputedStyle(node.parentElement!).opacity))).toBe(1);
    await page.screenshot({ path: test.info().outputPath(`landing-hero-${width}.png`) });
    await page.evaluate(() => document.fonts.ready);
    const before = await hero.evaluate(node => node.getBoundingClientRect().top + scrollY);
    await page.mouse.wheel(0, 320);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
    expect(await hero.evaluate(node => node.getBoundingClientRect().top + scrollY)).toBeCloseTo(before, 1);
    await page.mouse.wheel(0, -320);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(20);
    expect(await hero.evaluate(node => node.getBoundingClientRect().top + scrollY)).toBeCloseTo(before, 1);

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
    const footer = page.getByRole('contentinfo').locator('[data-decorative-video="Footer landscape"]');
    await footer.scrollIntoViewIfNeeded();
    await expect.poll(() => footer.locator('..').evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1);
    const footerBefore = await footer.evaluate(node => node.getBoundingClientRect().top + scrollY);
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -250);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(scrollBefore - 100);
    await expect.poll(() => footer.evaluate(node => node.getBoundingClientRect().top + scrollY)).toBeCloseTo(footerBefore, 1);
    await expect(page.locator('[data-scroll-layer], [data-landing-motion]')).toHaveCount(0);
    await catalog.focus();
    await catalog.press('Enter');
    await expect(page.getByLabel('USDC budget')).toBeVisible();
    await expect(hero).toHaveCount(0);
  });
}

test('changing motion preference preserves readable content and resumes visible video', async ({ page }) => {
  await page.goto('/');
  const heroVideo = page.getByRole('main').locator('[data-decorative-video="Hero boomerang"] video');
  await expect.poll(() => heroVideo.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => heroVideo.evaluate(node => (node as HTMLVideoElement).paused)).toBe(true);
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  expect(await page.locator('[data-reveal]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === '1'))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const footerVideo = page.getByRole('contentinfo').locator('video');
  await expect.poll(() => footerVideo.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
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
