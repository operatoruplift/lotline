import { expect, test } from './test';
import AxeBuilder from '@axe-core/playwright';

test('brand kit provides complete, downloadable social assets', async ({ page }) => {
  await page.goto('/brand-kit');
  await expect(page.getByRole('heading', { name: 'A complete kit, ready to move.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download full kit/ })).toHaveAttribute('href', '/brand-kit/lotline-brand-kit.zip');
  await expect(page.locator('article')).toHaveCount(19);
  await expect(page.locator('a[download]:not([download="lotline-brand-kit.zip"])')).toHaveCount(19);
  await expect(page.locator('a[download="profile-light.png"]')).toBeVisible();
  await expect(page.locator('a[download="wallpaper-phone.png"]')).toBeVisible();
  await expect(page.locator('a[download="header-x.png"]')).toBeVisible();
  await expect(page.locator('a[download="background-forest.svg"]')).toBeVisible();
  const zip = await page.request.get('/brand-kit/lotline-brand-kit.zip');
  expect(zip.status()).toBe(200);
  expect(zip.headers()['content-type']).toContain('zip');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('a[download="profile-light.png"]')).toBeVisible();
});
