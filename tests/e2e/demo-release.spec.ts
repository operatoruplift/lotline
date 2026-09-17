import { expect, test } from './test';
import AxeBuilder from '@axe-core/playwright';
import release from '../../docs/video-release-manifest.json' with { type: 'json' };

for (const width of [390, 1440]) {
  test(`current narrated films decode, seek and expose matching captions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo');
    await expect(page.getByText(/Explore 832 Example assets, choose up to ten/)).toBeVisible();

    for (const key of ['product', 'technical'] as const) {
      const film = release.films[key];
      const player = page.locator(`[data-demo-video="${key}"]`);
      await player.scrollIntoViewIfNeeded();
      await expect(player.locator('source')).toHaveAttribute('src', film.src);
      await expect(player.locator('track')).toHaveAttribute('src', film.captions);
      await expect(player).toHaveAttribute('poster', film.poster);
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
      const initial = await player.evaluate(node => {
        const video = node as HTMLVideoElement;
        return { duration: video.duration, width: video.videoWidth, paused: video.paused, controls: video.controls, muted: video.muted, inline: video.playsInline };
      });
      expect(initial.duration).toBeCloseTo(film.durationSeconds, 0);
      expect(initial.width).toBeGreaterThanOrEqual(1280);
      expect(initial).toMatchObject({ paused: true, controls: true, muted: false, inline: true });
      await player.evaluate(node => (node as HTMLVideoElement).play());
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.25);
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount)).toBeGreaterThan(0);
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).textTracks[0]?.cues?.length ?? 0)).toBeGreaterThan(10);
      const cues = await player.evaluate(node => Array.from((node as HTMLVideoElement).textTracks[0].cues ?? []).map(cue => ({ start: cue.startTime, end: cue.endTime, text: (cue as VTTCue).text })));
      expect(cues.map(cue => cue.text).join(' ')).toMatch(/832|eight hundred.*thirty.two/i);
      for (const cue of cues) {
        expect(cue.start).toBeGreaterThanOrEqual(0);
        expect(cue.end).toBeGreaterThan(cue.start);
        expect(cue.end).toBeLessThanOrEqual(initial.duration + .1);
      }
      await player.evaluate(node => { const video = node as HTMLVideoElement; video.currentTime = video.duration / 2; });
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).seeking)).toBe(false);
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(initial.duration / 2);
      await player.evaluate(node => (node as HTMLVideoElement).pause());
    }

    await page.getByText('Read the product tour', { exact: true }).click();
    await expect(page.locator('.demo-transcript').first()).toContainText(release.films.product.transcript);
    await page.getByText('Read the technical walkthrough', { exact: true }).click();
    await expect(page.locator('.demo-transcript').last()).toContainText(release.films.technical.transcript);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
