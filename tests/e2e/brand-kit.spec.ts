import { expect, test } from './test';
import AxeBuilder from '@axe-core/playwright';

test('brand kit provides complete, downloadable social assets', async ({ page }) => {
  const expectPortraitsContained = async () => {
    for (const label of ['Story', 'Phone wallpaper']) {
      const preview = page.getByRole('link', { name: `Preview ${label} at full size (opens in a new tab)`, exact: true });
      await preview.scrollIntoViewIfNeeded();
      const image = preview.locator('img');
      await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.naturalWidth > 0)).toBe(true);
      expect(await image.evaluate(element => {
        const imageBounds = element.getBoundingClientRect();
        const frame = element.parentElement!.getBoundingClientRect();
        return imageBounds.left >= frame.left && imageBounds.top >= frame.top
          && imageBounds.right <= frame.right && imageBounds.bottom <= frame.bottom;
      }), `${label} should be fully contained in its preview`).toBe(true);
    }
  };
  await page.goto('/brand-kit');
  await expect(page.getByRole('heading', { name: 'A complete kit, ready to move.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download full kit/ })).toHaveAttribute('href', '/brand-kit/lotline-brand-kit.zip');
  await expect(page.locator('article')).toHaveCount(19);
  await expect(page.locator('a[download]:not([download="lotline-brand-kit.zip"])')).toHaveCount(19);
  await expect(page.locator('a[download="profile-light.png"]')).toBeVisible();
  await expect(page.locator('a[download="wallpaper-phone.png"]')).toBeVisible();
  await expect(page.locator('a[download="header-x.png"]')).toBeVisible();
  await expect(page.locator('a[download="background-forest.svg"]')).toBeVisible();
  const wallpaper = page.getByRole('link', { name: 'Open Phone wallpaper at full size (opens in a new tab)', exact: true });
  await expect(wallpaper).toHaveAttribute('href', '/brand-kit/wallpaper-phone.png?v=sculpture-2');
  await expect(wallpaper).toHaveAttribute('target', '_blank');
  const zip = await page.request.get('/brand-kit/lotline-brand-kit.zip');
  expect(zip.status()).toBe(200);
  expect(zip.headers()['content-type']).toContain('zip');
  await expectPortraitsContained();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('a[download="profile-light.png"]')).toBeVisible();
  await expectPortraitsContained();
  const popupPromise = page.waitForEvent('popup');
  await wallpaper.click();
  const fullSize = await popupPromise;
  await fullSize.waitForLoadState('domcontentloaded');
  await expect(fullSize).toHaveURL(/\/brand-kit\/wallpaper-phone\.png\?v=sculpture-2$/);
  await expect.poll(() => fullSize.locator('img').evaluate(image => image instanceof HTMLImageElement ? image.naturalWidth : 0)).toBe(1290);
  await fullSize.close();

  await page.setViewportSize({ width: 320, height: 740 });
  await expectPortraitsContained();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
