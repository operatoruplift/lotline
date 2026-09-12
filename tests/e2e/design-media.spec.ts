import { expect, test } from '@playwright/test';

test('decorative video really decodes, advances, pauses offscreen and obeys a persistent motion preference', async ({ page }) => {
  await page.goto('/');
  // Next's streamed HTML may briefly retain a second copy in a hidden boundary.
  // Select the rendered scene while keeping strict matching for visible duplicates.
  const hero = page.locator('[data-decorative-video="Hero boomerang"]:visible video');
  await expect(hero).toHaveCount(1);
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  expect(await hero.evaluate(video => ({ width: (video as HTMLVideoElement).videoWidth, muted: (video as HTMLVideoElement).muted, inline: (video as HTMLVideoElement).playsInline }))).toEqual({ width:1280, muted:true, inline:true });
  const before = await hero.evaluate(video => (video as HTMLVideoElement).currentTime);
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(before + .25);
  await page.getByRole('button', { name:'Pause motion', exact:true }).click();
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name:'Resume motion', exact:true })).toBeVisible();
  await expect(page.getByRole('heading', { name:'Your next contribution, clearly.' })).toHaveCSS('opacity','1');
  await expect(page.locator('[data-preview="contribution"]').locator('..')).toHaveCSS('opacity','1');
  expect(await hero.getAttribute('src')).toBeNull();
  await page.getByRole('button', { name:'Resume motion', exact:true }).click();
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).paused)).toBe(false);
  await page.locator('#features').scrollIntoViewIfNeeded();
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  const feature = page.locator('[data-decorative-video="Verified assets"]:visible video');
  await expect.poll(() => feature.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.emulateMedia({ reducedMotion:'reduce' });
  await expect.poll(() => feature.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  await expect(page.getByRole('button', { name:'Motion reduced by your device setting' })).toBeDisabled();
});

test('reduced motion loads posters without video sources; autoplay rejection keeps a real fallback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' }); await page.goto('/');
  await expect(page.getByRole('button', { name:'Motion reduced by your device setting' })).toBeDisabled();
  expect(await page.locator('video[src]').count()).toBe(0);
  const poster = page.locator('[data-decorative-video="Hero boomerang"]:visible img');
  await expect.poll(() => poster.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Autoplay blocked','NotAllowedError')); });
  await page.reload();
  await expect(page.locator('[data-decorative-video="Hero boomerang"]:visible')).toHaveAttribute('data-playback','fallback');
  await expect(poster).toBeVisible();
  await page.getByRole('link', { name:'Make a plan',exact:true }).first().click();
  await expect(page.getByLabel('USDC budget')).toBeVisible();
});

test('decorative players release the old route and use the mobile derivative', async ({ page }) => {
  await page.setViewportSize({ width:390,height:844 });
  await page.goto('/');
  const video = page.locator('[data-decorative-video="Hero boomerang"]:visible video');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('src', /\/media\/design\/hero-boomerang-mobile\.mp4$/);
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await video.evaluate(node => { (window as unknown as { retiredVideo:HTMLVideoElement }).retiredVideo = node as HTMLVideoElement; });
  await page.getByRole('link', { name:'Watch demo' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect.poll(() => page.evaluate(() => { const old = (window as unknown as { retiredVideo:HTMLVideoElement }).retiredVideo; return { paused:old.paused, source:old.getAttribute('src'), connected:old.isConnected }; })).toEqual({ paused:true, source:null, connected:false });
  await page.goto('/'); await expect(page.getByRole('heading',{ name:'Your next contribution, clearly.' })).toBeVisible();
});
