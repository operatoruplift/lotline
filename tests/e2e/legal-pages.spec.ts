import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './test';

const pages = [
  { path: '/privacy', heading: 'What Lotline stores, and why.', must: ['Sign in with Solana', 'purchase journal', 'Transactions on Solana are public and permanent.', 'salted hash of the IP address', 'GeckoTerminal', 'Adults only'] },
  { path: '/terms', heading: 'The terms for using Lotline.', must: ['Solana Mobile is not a party to them', 'no responsibility or liability for Lotline, its content, or its support or maintenance', 'at least 18 years old', 'xstocks.com', 'Lotline never holds your private keys', 'administrative transfer', 'Leveraged products', 'Limitation of liability', 'Governing law'] },
];

for (const { path, heading, must } of pages) {
  test(`${path} is public, dated, specific to Lotline and accessible`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const main = page.locator('main#main');
    await expect(main.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(main.getByText('Last updated: 7 October 2026 · Operator Uplift')).toBeVisible();
    for (const text of must) await expect(main).toContainText(text);
    // No support email is configured here, so contact falls back to the repository's issues.
    await expect(main.getByRole('link', { name: /GitHub Issues/ })).toHaveAttribute('href', 'https://github.com/operatoruplift/lotline/issues');
    await expect(main.getByRole('navigation', { name: 'On this page' }).getByRole('link')).not.toHaveCount(0);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('every page links to the privacy policy and terms from its footer', async ({ page, request }) => {
  for (const path of ['/', '/app', '/pre-ipo', '/how-it-works', '/demo', '/brand-kit', '/sign-in', '/sign-up', '/privacy', '/terms']) {
    await page.goto(path);
    const footer = page.getByRole('navigation', { name: 'Footer navigation' });
    await expect(footer.getByRole('link', { name: 'Privacy', exact: true }), path).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Terms', exact: true }), path).toHaveAttribute('href', '/terms');
  }
  // The 404 page's own main is a route state, which the navigation helper waits out, so read its markup directly.
  const missing = await request.get('/no-such-page');
  expect(missing.status()).toBe(404);
  const html = await missing.text();
  expect(html).toContain('href="/privacy"');
  expect(html).toContain('href="/terms"');
});

test('the sitemap lists both legal pages', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('<loc>https://lotline.dev/privacy</loc>');
  expect(sitemap).toContain('<loc>https://lotline.dev/terms</loc>');
});
