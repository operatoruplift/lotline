import { expect, test } from './test';
import AxeBuilder from '@axe-core/playwright';
import release from '../../docs/video-release-manifest.json' with { type: 'json' };

for (const width of [390, 1440]) {
  test(`preserved tours and current contribution demonstrations decode at ${width}px`, async ({ page, request }) => {
    // Six films each decode, load captions, and seek before the page accessibility scan.
    // Allow their cumulative work while retaining the shared 10-second assertion limits.
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo');
    await expect(page.getByText(/Explore 832 Example assets, choose up to ten/)).toBeVisible();
    await expect(page.locator('[data-demo-video]')).toHaveCount(6);
    const sponsor = page.locator('[data-demo-video="sponsor-planning"]');
    await expect(sponsor).toHaveAttribute('aria-describedby', 'sponsor-demo-description');
    await expect(page.locator('#sponsor-demo-description')).toContainText('controlled fixtures');
    await expect(page.locator('#sponsor-demo-description')).toContainText('Pyth reference status');
    await sponsor.scrollIntoViewIfNeeded();
    await sponsor.evaluate(node => (node as HTMLVideoElement).play());
    await expect.poll(() => sponsor.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.25);
    const sponsorState = await sponsor.evaluate(node => { const video = node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }; return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, muted: video.muted, controls: video.controls, audioBytes: video.webkitAudioDecodedByteCount }; });
    expect(sponsorState.duration).toBeGreaterThanOrEqual(25);
    expect(sponsorState.duration).toBeLessThanOrEqual(45);
    expect(sponsorState).toMatchObject({ width: 1440, height: 1000, muted: false, controls: true });
    await expect.poll(() => sponsor.evaluate(node => (node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount)).toBeGreaterThan(0);
    await expect.poll(() => sponsor.evaluate(node => (node as HTMLVideoElement).textTracks[0]?.cues?.length ?? 0)).toBe(6);
    const sponsorCues = await sponsor.evaluate(node => Array.from((node as HTMLVideoElement).textTracks[0].cues ?? []).map(cue => ({ start: cue.startTime, end: cue.endTime, text: (cue as VTTCue).text })));
    expect(sponsorCues.map(cue => cue.text).join(' ')).toMatch(/Pyth reference/i);
    for (const cue of sponsorCues) { expect(cue.start).toBeGreaterThanOrEqual(0); expect(cue.end).toBeGreaterThan(cue.start); expect(cue.end).toBeLessThanOrEqual(sponsorState.duration + .1); }
    await sponsor.evaluate(node => { const video = node as HTMLVideoElement; video.currentTime = video.duration / 2; });
    await expect.poll(() => sponsor.evaluate(node => (node as HTMLVideoElement).seeking)).toBe(false);
    await sponsor.evaluate(node => (node as HTMLVideoElement).pause());
    const sponsorTranscript = await request.get('/videos/release-20260921/sponsor-planning.transcript.txt');
    expect(sponsorTranscript.ok()).toBe(true);
    expect(await sponsorTranscript.text()).toContain('Pyth reference status');

    for (const key of ['first-minute', 'technical-proof']) {
      const player = page.locator(`[data-demo-video="${key}"]`);
      await player.scrollIntoViewIfNeeded();
      await player.evaluate(node => (node as HTMLVideoElement).play());
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(.25);
      const state = await player.evaluate(node => { const video = node as HTMLVideoElement; return { duration: video.duration, width: video.videoWidth, muted: video.muted, controls: video.controls }; });
      expect(state.duration).toBeGreaterThan(15);
      expect(state.width).toBeGreaterThanOrEqual(1280);
      expect(state).toMatchObject({ muted: false, controls: true });
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount)).toBeGreaterThan(0);
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).textTracks[0]?.cues?.length ?? 0)).toBeGreaterThan(2);
      await player.evaluate(node => { const video = node as HTMLVideoElement; video.currentTime = video.duration / 2; });
      await expect.poll(() => player.evaluate(node => (node as HTMLVideoElement).seeking)).toBe(false);
      await player.evaluate(node => (node as HTMLVideoElement).pause());
      const transcript = await request.get(`/videos/release-20260920/${key}.transcript.txt`);
      expect(transcript.ok()).toBe(true);
      expect(await transcript.text()).toMatch(/controlled|mocked|fixture/i);
    }

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
    expect(fixtureMedia).toMatchObject({ width: 1440, height: 1000, controls: true, muted: false, inline: true });
    await expect.poll(() => controlled.evaluate(node => (node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount)).toBeGreaterThan(0);
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
