import { expect, test, type Page } from './test';

async function renderedGlass(page: Page) {
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  const scene = main.locator('[data-glass-scene]');
  const card = scene.locator('[data-glass-card]');
  const media = scene.locator('video');
  await expect(scene).toHaveCount(1);
  await expect(card).toHaveCount(1);
  await expect(media).toHaveCount(1);
  return { scene, card, media };
}

test('samples real video pixels, advances frames, has no pause control, and releases its surface on navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const sources = new Set<string>();
  page.on('request', request => { if (/auth-glass(?:-mobile)?\.mp4/.test(request.url())) sources.add(new URL(request.url()).pathname); });
  await page.goto('/sign-in');
  const { scene, card, media } = await renderedGlass(page);
  await expect(card).toHaveAttribute('data-refraction-state', 'video', { timeout: 30_000 });
  await expect(card.locator('canvas')).toHaveAttribute('data-refraction-sampled', 'true');
  await page.getByLabel('Email address').fill('first@example.test');
  await page.getByLabel('Email address').fill('edited@example.test');
  await expect(card).toHaveAttribute('data-entrance', 'done');
  expect(await card.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  const start = await media.evaluate(video => (video as HTMLVideoElement).currentTime);
  await expect.poll(() => media.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(start + 0.1);
  const buffer = await card.locator('canvas').evaluate(canvas => ({ width: (canvas as HTMLCanvasElement).width, height: (canvas as HTMLCanvasElement).height }));
  expect(buffer.width * buffer.height).toBeLessThanOrEqual(600_000);
  await expect(page.getByRole('button', { name: 'Pause background', exact: true })).toHaveCount(0);
  await expect.poll(() => media.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(start + 0.35);
  await expect(card).toHaveAttribute('data-refraction-state', 'video');
  expect(sources.size).toBe(1);
  await scene.evaluate(node => {
    const holder = window as typeof window & { oldGlass?: { media: HTMLVideoElement; canvas: HTMLCanvasElement } };
    holder.oldGlass = { media: node.querySelector('video')!, canvas: node.querySelector('[data-glass-card] canvas')! };
  });
  await page.getByRole('link', { name: 'Continue without an account', exact: true }).click();
  await expect(page).toHaveURL(/\/app\?mode=example$/);
  await expect.poll(() => page.evaluate(() => {
    const old = (window as typeof window & { oldGlass?: { media: HTMLVideoElement; canvas: HTMLCanvasElement } }).oldGlass;
    return !!old && old.media.paused && !old.media.getAttribute('src') && !old.canvas.isConnected && old.canvas.getContext('webgl')?.isContextLost();
  })).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced motion uses a refracted still with no video download and does not replay on typing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requested: string[] = [];
  page.on('request', request => { if (/auth-glass(?:-mobile)?\.mp4/.test(request.url())) requested.push(request.url()); });
  await page.goto('/sign-in');
  const { card, media } = await renderedGlass(page);
  await expect(card).toHaveAttribute('data-refraction-state', 'poster');
  await expect(card.locator('canvas')).toHaveAttribute('data-refraction-sampled', 'true');
  expect(requested).toEqual([]);
  await page.getByLabel('Email address').fill('draft@example.test');
  await expect(card).toHaveAttribute('data-entrance', 'done');
  expect(await card.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(card).toHaveAttribute('data-refraction-state', 'video', { timeout: 30_000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => media.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  await expect(card).toHaveAttribute('data-entrance', 'done');
});

test('graphics failure keeps native account controls and the guest path usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return kind === 'webgl' ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.goto('/sign-in');
  const { card } = await renderedGlass(page);
  await expect(card).toHaveAttribute('data-refraction-state', 'fallback');
  await page.getByLabel('Email address').fill('draft@example.test');
  await expect(page.getByLabel('Email address')).toHaveValue('draft@example.test');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Continue without an account', exact: true }).click();
  await expect(page).toHaveURL(/\/app\?mode=example$/);
});

test('pauses offscreen and on visibility events, then resumes when the scene returns', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto('/sign-in');
  const { card, media } = await renderedGlass(page);
  await expect(card).toHaveAttribute('data-refraction-state', 'video');
  // Give the short test viewport enough document to move the whole scene out of view.
  await page.evaluate(() => {
    const space = document.createElement('div');
    space.style.height = '100vh'; document.body.appendChild(space);
    space.scrollIntoView();
  });
  await expect.poll(() => media.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => media.evaluate(video => (video as HTMLVideoElement).paused)).toBe(false);
  // Exercise the real visibility listener with deterministic document state.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => media.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden'); Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => media.evaluate(video => (video as HTMLVideoElement).paused)).toBe(false);
});

test('blocked autoplay offers a real retry while the still and native form remain usable', async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Autoplay disabled by this test', 'NotAllowedError')); });
  await page.goto('/sign-in');
  const { scene } = await renderedGlass(page);
  await expect(scene).toHaveAttribute('data-playback', 'blocked');
  await expect(page.getByRole('button', { name: 'Play background', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').fill('draft@example.test');
  await expect(page.getByLabel('Email address')).toHaveValue('draft@example.test');
  await expect(page.getByRole('link', { name: 'Continue without an account', exact: true })).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 720, height: 500 }]) {
  test(`account controls stay in normal flow at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/sign-in');
    const { card } = await renderedGlass(page);
    await expect(card).toHaveAttribute('data-refraction-state', 'poster');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const fields = card.locator('input');
    await expect(fields).toHaveCount(2);
    for (const field of await fields.all()) {
      await field.focus();
      await expect(field).toBeInViewport();
      expect(await field.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
    }
    const guest = page.getByRole('link', { name: 'Continue without an account', exact: true });
    await guest.focus();
    await expect(guest).toBeInViewport();
    await guest.press('Enter');
    await expect(page).toHaveURL(/\/app\?mode=example$/);
  });
}
