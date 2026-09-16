import { expect, test } from '@playwright/test';

test('decorative video really decodes, advances, pauses offscreen and has no manual pause control', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  // Next's streamed HTML may briefly retain a second copy in a hidden boundary.
  // Select the rendered scene while keeping strict matching for visible duplicates.
  const hero = main.locator('[data-decorative-video="Hero boomerang"] video');
  await expect(hero).toHaveCount(1);
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  expect(await hero.evaluate(video => ({ width: (video as HTMLVideoElement).videoWidth, muted: (video as HTMLVideoElement).muted, inline: (video as HTMLVideoElement).playsInline }))).toEqual({ width:1280, muted:true, inline:true });
  const before = await hero.evaluate(video => (video as HTMLVideoElement).currentTime);
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(before + .25);
  await expect(page.getByRole('button', { name:/Pause motion|Resume motion|Motion paused/, exact:true })).toHaveCount(0);
  await page.reload();
  await expect.poll(() => page.getByRole('heading', { name:'Your next contribution, clearly.' }).evaluate(node => Number(getComputedStyle(node).opacity))).toBeGreaterThan(.99);
  await expect.poll(() => main.locator('[data-preview="contribution"]').locator('..').evaluate(node => Number(getComputedStyle(node).opacity))).toBeGreaterThan(.99);
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await main.locator('#features').scrollIntoViewIfNeeded();
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  const feature = main.locator('[data-decorative-video="Verified assets"] video');
  await expect(feature).toHaveCount(1);
  await expect.poll(() => feature.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.emulateMedia({ reducedMotion:'reduce' });
  await expect.poll(() => feature.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  await expect(page.getByRole('button', { name:/Motion reduced|Pause motion|Resume motion/, exact:true })).toHaveCount(0);
});

test('reduced motion loads posters without video sources; autoplay rejection keeps a real fallback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' }); await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  await expect(page.getByRole('button', { name:/Motion reduced|Pause motion|Resume motion/, exact:true })).toHaveCount(0);
  expect(await page.locator('video[src]').count()).toBe(0);
  const poster = main.locator('[data-decorative-video="Hero boomerang"] img');
  await expect(poster).toHaveCount(1);
  await expect.poll(() => poster.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Autoplay blocked','NotAllowedError')); });
  await page.reload();
  await expect(main.locator('[data-decorative-video="Hero boomerang"]')).toHaveAttribute('data-playback','fallback');
  await expect(poster).toBeVisible();
  await main.getByRole('link', { name:'Make a plan',exact:true }).click();
  await expect(page.getByLabel('USDC budget')).toBeVisible();
});

test('decorative players release the old route and use the mobile derivative', async ({ page }) => {
  await page.setViewportSize({ width:390,height:844 });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  const video = main.locator('[data-decorative-video="Hero boomerang"] video');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('src', /\/media\/design\/hero-boomerang-mobile\.mp4$/);
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await video.evaluate(node => { (window as unknown as { retiredVideo:HTMLVideoElement }).retiredVideo = node as HTMLVideoElement; });
  await page.getByRole('link', { name:'Watch demo' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect.poll(() => page.evaluate(() => { const old = (window as unknown as { retiredVideo:HTMLVideoElement }).retiredVideo; return { paused:old.paused, source:old.getAttribute('src'), connected:old.isConnected }; })).toEqual({ paused:true, source:null, connected:false });
  await page.goto('/'); await expect(page.getByRole('heading',{ name:'Your next contribution, clearly.' })).toBeVisible();
});
