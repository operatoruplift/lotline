import { expect, test } from './test';

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
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      if (this.src.endsWith('/media/design/hero-boomerang.mp4')) this.dataset.playAttempts = String(Number(this.dataset.playAttempts ?? 0) + 1);
      return Promise.reject(new DOMException('Autoplay blocked','NotAllowedError'));
    };
  });
  await page.reload();
  await expect(main.locator('[data-decorative-video="Hero boomerang"]')).toHaveAttribute('data-playback','fallback');
  await expect(poster).toBeVisible();
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await poster.scrollIntoViewIfNeeded();
  await expect(main.locator('[data-decorative-video="Hero boomerang"] video')).toHaveAttribute('data-play-attempts', '1');
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

test('the next decorative scene decodes before entry but only plays in the viewport', async ({ page }) => {
  await page.goto('/');
  const scene = page.getByRole('main').locator('[data-decorative-video="A little room to think"]');
  const video = scene.locator('video');
  await expect(video).not.toHaveAttribute('src');
  await scene.evaluate(node => window.scrollBy({ top: node.getBoundingClientRect().top - innerHeight - 140, behavior: 'instant' }));
  await expect(video).toHaveAttribute('src', /\/media\/design\/support\.mp4$/);
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  expect(await scene.evaluate(node => node.getBoundingClientRect().top > innerHeight)).toBe(true);
  expect(await video.evaluate(node => ({ paused: (node as HTMLVideoElement).paused, time: (node as HTMLVideoElement).currentTime }))).toEqual({ paused: true, time: 0 });
  await scene.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => video.evaluate(node => ({ paused: (node as HTMLVideoElement).paused, opacity: Number(getComputedStyle(node).opacity) })) ).toEqual({ paused: true, opacity: 0 });
});

test('offline and reduced-motion visits do not request decorative films', async ({ page }) => {
  const films: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.mp4')) films.push(request.url()); });
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
  await page.goto('/');
  const hero = page.getByRole('main').locator('[data-decorative-video="Hero boomerang"]');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'running');
  await expect.poll(() => hero.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await expect(page.locator('video[src]')).toHaveCount(0);
  expect(films).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('video[src]')).toHaveCount(0);
  expect(films).toEqual([]);
  await expect.poll(() => page.getByRole('contentinfo').locator('[data-reveal]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === '1' && getComputedStyle(node).transform === 'none'))).toBe(true);
});

test('a revealed card stays readable after focus leaves and motion preferences change', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Explore the catalog' });
  const reveal = link.locator('xpath=ancestor::*[@data-reveal][1]');
  await link.scrollIntoViewIfNeeded();
  await expect(reveal).toHaveAttribute('data-seen', 'true');
  await expect.poll(() => reveal.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await link.focus();
  await link.evaluate(node => (node as HTMLElement).blur());
  expect(await reveal.evaluate(node => ({ opacity: getComputedStyle(node).opacity, activeAnimations: node.getAnimations().filter(animation => animation.playState === 'running').length }))).toEqual({ opacity: '1', activeAnimations: 0 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'running');
  expect(await reveal.evaluate(node => getComputedStyle(node).opacity)).toBe('1');

  // Reading a card with motion reduced also counts as seeing it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const footerReveal = page.getByRole('contentinfo').locator('[data-reveal]').first();
  await footerReveal.scrollIntoViewIfNeeded();
  await expect(footerReveal).toHaveAttribute('data-seen', 'true');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'running');
  expect(await footerReveal.evaluate(node => ({ opacity: getComputedStyle(node).opacity, activeAnimations: node.getAnimations().filter(animation => animation.playState === 'running').length }))).toEqual({ opacity: '1', activeAnimations: 0 });
});

for (const recovery of ['reconnect', 'reentry']) {
  test(`a transient decorative film failure recovers after ${recovery}`, async ({ page, context }) => {
    let attempts = 0;
    await page.route('**/media/design/hero-boomerang.mp4', route => ++attempts === 1 ? route.abort('internetdisconnected') : route.continue());
    await page.goto('/');
    const hero = page.getByRole('main').locator('[data-decorative-video="Hero boomerang"]');
    await expect(hero).toHaveAttribute('data-playback', 'fallback');
    if (recovery === 'reconnect') {
      await context.setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
      await context.setOffline(false);
    } else {
      await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
      await hero.scrollIntoViewIfNeeded();
    }
    await expect.poll(() => hero.locator('video').evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
    await expect(hero).toHaveAttribute('data-playback', 'playing');
  });
}

test('decorative recovery respects reduced motion and stops after one retry', async ({ page, context }) => {
  let attempts = 0;
  await page.route('**/media/design/hero-boomerang.mp4', route => { attempts++; return route.abort('internetdisconnected'); });
  await page.goto('/');
  const hero = page.getByRole('main').locator('[data-decorative-video="Hero boomerang"]');
  await expect(hero).toHaveAttribute('data-playback', 'fallback');
  expect(attempts).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await context.setOffline(false);
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await hero.scrollIntoViewIfNeeded();
  expect(attempts).toBe(1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'running');
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await hero.scrollIntoViewIfNeeded();
  await expect.poll(() => attempts).toBe(2);
  await expect(hero).toHaveAttribute('data-playback', 'fallback');
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await context.setOffline(false);
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await hero.scrollIntoViewIfNeeded();
  expect(attempts).toBe(2);
  await expect(hero).toHaveAttribute('data-playback', 'fallback');
});
