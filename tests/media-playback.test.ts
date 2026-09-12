import { describe, expect, it, vi } from 'vitest';
import { controlPlayback, shouldPlayDecorativeVideo } from '@/lib/media/playback';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
describe('decorative media lifecycle', () => {
  it('requires a visible, decoded, allowed and healthy scene', () => {
    const conditions = { allowed: true, inView: true, sourceReady: true, failed: false };
    expect(shouldPlayDecorativeVideo(conditions)).toBe(true);
    for (const key of ['allowed', 'inView', 'sourceReady'] as const) expect(shouldPlayDecorativeVideo({ ...conditions, [key]: false })).toBe(false);
    expect(shouldPlayDecorativeVideo({ ...conditions, failed: true })).toBe(false);
  });
  it('pauses a late play completion after unmount', async () => {
    let resolve!: () => void;
    const video = { play: vi.fn(() => new Promise<void>(done => { resolve = done; })), pause: vi.fn() };
    const stop = controlPlayback(video, true, vi.fn());
    stop(); resolve(); await flush();
    expect(video.pause).toHaveBeenCalledTimes(2);
  });
  it('does not let a stale play completion stop the new active scene', async () => {
    let resolve!: () => void;
    const video = { play: vi.fn().mockImplementationOnce(() => new Promise<void>(done => { resolve = done; })).mockResolvedValue(undefined), pause: vi.fn() };
    const stop = controlPlayback(video, true, vi.fn()); stop();
    const finish = controlPlayback(video, true, vi.fn());
    video.pause.mockClear(); resolve(); await flush();
    expect(video.pause).not.toHaveBeenCalled(); finish();
  });
  it('reports autoplay failure once without reviving an abandoned effect', async () => {
    const failed = vi.fn();
    const video = { play: vi.fn().mockRejectedValue(new Error('blocked')), pause: vi.fn() };
    const stop = controlPlayback(video, true, failed); await flush(); expect(failed).toHaveBeenCalledOnce(); stop();
    failed.mockClear(); const abandoned = controlPlayback(video, true, failed); abandoned(); await flush(); expect(failed).not.toHaveBeenCalled();
  });
});
