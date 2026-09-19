import { expect, test } from './test';
import AxeBuilder from '@axe-core/playwright';
import release from '../../docs/video-release-manifest.json' with { type: 'json' };

for (const width of [390, 1440]) {
  test(`dated narrated tours and current controlled demonstration decode at ${width}px`, async ({ page }) => {
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
    await expect(page.locator('#technical .demo-transcript')).toContainText(release.films.technical.transcript);
    const controlled = page.locator('[data-demo-video="controlled"]');
    await expect(page.getByRole('heading', { name: 'Review. Recover. Return next time.', exact: true })).toBeVisible();
    await expect(page.locator('#controlled-demo-description')).toContainText('fake Wallet Standard wallet and mocked Jupiter and Solana responses');
    await expect(page.locator('#controlled-demo-description')).toContainText('No funds moved');
    await expect(controlled).toHaveAttribute('preload', 'none');
    await expect(controlled).toHaveAttribute('aria-describedby', 'controlled-demo-description');
    await expect(controlled.locator('source')).toHaveAttribute('src', '/videos/release-20260919/execution-fixture-walkthrough.mp4');
    await controlled.scrollIntoViewIfNeeded();
    await controlled.evaluate(node => (node as HTMLVideoElement).play());
    await expect.poll(() => controlled.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.25);
    const fixtureMedia = await controlled.evaluate(node => {
      const video = node as HTMLVideoElement & { webkitAudioDecodedByteCount: number };
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, controls: video.controls, muted: video.muted, inline: video.playsInline, audioBytes: video.webkitAudioDecodedByteCount };
    });
    expect(fixtureMedia.duration).toBeCloseTo(25.2, 1);
    expect(fixtureMedia).toMatchObject({ width: 1440, height: 1000, controls: true, muted: true, inline: true, audioBytes: 0 });
    await controlled.evaluate(node => { const video = node as HTMLVideoElement; video.currentTime = 12; });
    await expect.poll(() => controlled.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(12);
    await controlled.evaluate(node => (node as HTMLVideoElement).pause());
    await page.getByText('Read the controlled demonstration', { exact: true }).click();
    await expect(page.locator('#controlled-demo .demo-transcript')).toContainText('No real transaction was signed or submitted.');
    await expect(page.getByRole('link', { name: 'Download controlled demonstration', exact: true })).toHaveAttribute('download', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
