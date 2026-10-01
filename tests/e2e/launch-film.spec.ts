import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './test';

for (const width of [390, 1440]) {
  test(`launch film plays with original audio, descriptions and coordinated controls at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo');
    const launch = page.locator('[data-demo-video="launch"]');
    await expect(launch).toHaveAttribute('preload', 'none');
    await expect(launch).not.toHaveAttribute('autoplay');
    await expect(launch).toHaveAttribute('aria-describedby', 'launch-film-context');
    await expect(page.locator('#launch-film-context')).toContainText('does not show a mainnet purchase');
    expect(await launch.evaluate(node => (node as HTMLVideoElement).paused)).toBe(true);
    await launch.scrollIntoViewIfNeeded();
    await launch.evaluate(node => (node as HTMLVideoElement).play());
    await expect.poll(() => launch.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.25);
    await expect.poll(() => launch.evaluate(node => (node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount)).toBeGreaterThan(0);
    await expect.poll(() => launch.evaluate(node => (node as HTMLVideoElement).textTracks[0]?.cues?.length ?? 0)).toBe(10);
    const media = await launch.evaluate(node => {
      const video = node as HTMLVideoElement;
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, muted: video.muted, controls: video.controls, inline: video.playsInline };
    });
    expect(media).toMatchObject({ width: 1920, height: 1080, muted: false, controls: true, inline: true });
    expect(media.duration).toBeCloseTo(30, 1);
    const cues = await launch.evaluate(node => Array.from((node as HTMLVideoElement).textTracks[0].cues ?? []).map(cue => ({ start: cue.startTime, end: cue.endTime })));
    for (const cue of cues) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.end).toBeLessThanOrEqual(media.duration);
    }
    await launch.evaluate(node => { (node as HTMLVideoElement).currentTime = 20; });
    await expect.poll(() => launch.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(20);
    const tour = page.locator('[data-demo-video="current-product"]');
    await tour.evaluate(node => (node as HTMLVideoElement).play());
    await expect.poll(() => launch.evaluate(node => (node as HTMLVideoElement).paused)).toBe(true);
    await launch.evaluate(node => (node as HTMLVideoElement).play());
    await expect.poll(() => tour.evaluate(node => (node as HTMLVideoElement).paused)).toBe(true);
    await launch.evaluate(node => (node as HTMLVideoElement).pause());
    await expect(page.getByRole('link', { name: 'Save launch film', exact: true })).toHaveAttribute('download', '');
    const transcript = await request.get('/videos/launch-20261001/launch-film.transcript.txt');
    expect(transcript.ok()).toBe(true);
    expect(await transcript.text()).toContain('no spoken narration');
    await page.getByText('Film details & credits', { exact: true }).click();
    await expect(page.locator('#launch-film')).toContainText('snapshot verified September 12');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
