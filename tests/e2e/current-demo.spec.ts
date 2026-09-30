import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './test';

for (const width of [390, 1440]) {
  test(`current tours switch, seek and retain their evidence labels at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo');
    const archive = page.locator('[data-demo-archive]');
    await expect(archive).not.toHaveAttribute('open');
    const first = page.getByRole('tab', { name: /Explore the app/ });
    const second = page.getByRole('tab', { name: /Inside the contribution/ });
    await expect(first).toHaveAttribute('aria-selected', 'true');
    const product = page.locator('[data-demo-video="current-product"]');
    await product.evaluate(node => (node as HTMLVideoElement).play());
    await expect.poll(() => product.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.25);
    await expect.poll(() => product.evaluate(node => (node as HTMLVideoElement).textTracks[0]?.cues?.length ?? 0)).toBeGreaterThan(4);
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute('aria-selected', 'true');
    expect(await product.evaluate(node => (node as HTMLVideoElement).paused)).toBe(true);
    const technical = page.locator('[data-demo-video="current-technical"]');
    await technical.evaluate(node => (node as HTMLVideoElement).play());
    await expect.poll(() => technical.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.25);
    await page.getByRole('button', { name: /0:10 Freshness is part of the result/ }).click();
    await expect.poll(() => technical.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(10);
    expect(await technical.evaluate(node => (node as HTMLVideoElement).videoWidth)).toBe(1920);
    await technical.evaluate(node => (node as HTMLVideoElement).pause());
    await expect(page.locator('#current-tour-context')).toContainText('No wallet connected and no funds moved');
    const transcript = await request.get('/videos/release-20260930/technical.transcript.txt');
    expect(transcript.ok()).toBe(true);
    expect(await transcript.text()).toContain('No generated UI');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
