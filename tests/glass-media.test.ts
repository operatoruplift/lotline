import { describe, expect, it, vi } from 'vitest';
import { glassBufferSize, glassGeometry, glassSample, glassTextureSize, GLASS_LIMITS } from '@/lib/media/glass-geometry';
import { glassFramePump } from '@/lib/media/glass-frames';

describe('glass video and card coordinates', () => {
  const source = { width: 1920, height: 1080 };
  it('matches centered cover cropping on a non-square scene', () => {
    const geometry = glassGeometry({ left: 0, top: 0, width: 800, height: 600 }, { left: 100, top: 50, width: 400, height: 500 }, source)!;
    expect(geometry.cover.left).toBeCloseTo(-133.333333);
    expect(geometry.cover.top).toBe(0);
    expect(glassSample(geometry, 200, 250)).toEqual({ x: 0.40625, y: 0.5 });
  });
  it('cancels viewport scrolling and parent offsets without applying DPR twice', () => {
    const scene = { left: 12, top: 200, width: 390, height: 900 };
    const card = { left: 30, top: 250, width: 354, height: 650 };
    const first = glassGeometry(scene, card, source)!;
    const scrolled = glassGeometry({ ...scene, left: 1012, top: -200 }, { ...card, left: 1030, top: -150 }, source)!;
    expect(first).toEqual(scrolled);
    expect(glassSample(first, 0, 0).x).toBeCloseTo(623 / 1600);
    expect(glassSample(first, 0, 0).y).toBeCloseTo(50 / 900);
    expect(glassBufferSize(first.card, 3)).not.toEqual(glassBufferSize(first.card, 1));
  });
  it('respects a non-centered object position', () => {
    const geometry = glassGeometry({ left: 0, top: 0, width: 800, height: 600 }, { left: 0, top: 0, width: 800, height: 600 }, source, { x: 1, y: 0 })!;
    expect(glassSample(geometry, 800, 600)).toEqual({ x: 1, y: 1 });
  });
  it('rejects hidden, unmeasured, or non-finite geometry', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(glassGeometry({ ...rect, width: 0 }, rect, source)).toBeNull();
    expect(glassGeometry(rect, { ...rect, left: NaN }, source)).toBeNull();
    expect(glassGeometry(rect, rect, { width: 0, height: 0 })).toBeNull();
  });
  it('bounds pixel area, longest edge, texture uploads, and extreme zoom', () => {
    for (const size of [{ width: 390, height: 900 }, { width: 4000, height: 2000 }, { width: 8000, height: 40 }]) {
      const result = glassBufferSize(size, 4);
      expect(result.width * result.height).toBeLessThanOrEqual(GLASS_LIMITS.pixels);
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(GLASS_LIMITS.edge);
    }
    expect(glassTextureSize({ width: 3840, height: 2160 })).toEqual({ width: 960, height: 540 });
    expect(glassTextureSize({ width: 768, height: 432 })).toEqual({ width: 768, height: 432 });
  });
});

function frameHarness(decoded: boolean) {
  let next = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => { pending.set(++next, callback); return next; });
  const cancel = vi.fn((id: number) => { pending.delete(id); });
  const video = { currentTime: 0, ...(decoded ? { requestVideoFrameCallback: request, cancelVideoFrameCallback: cancel } : {}) };
  const animationRequest = decoded ? vi.fn() : request;
  const paint = vi.fn();
  const pump = glassFramePump(video, { request: animationRequest, cancel }, paint);
  const tick = (now: number, mediaTime = now / 1000) => {
    video.currentTime = mediaTime;
    const [id, callback] = pending.entries().next().value!;
    pending.delete(id); callback(now);
  };
  return { pending, video, animationRequest, paint, pump, cancel, tick };
}

describe('bounded glass frame lifecycle', () => {
  it('prefers decoded callbacks, caps painting, and keeps just one pending callback', () => {
    const harness = frameHarness(true);
    harness.pump.start(); harness.pump.start();
    for (let now = 0; now < 1000; now += 10) {
      harness.tick(now);
      expect(harness.pending.size).toBe(1);
    }
    expect(harness.paint.mock.calls.length).toBeLessThanOrEqual(GLASS_LIMITS.fps);
    expect(harness.paint.mock.calls.length).toBeGreaterThan(20);
    expect(harness.animationRequest).not.toHaveBeenCalled();
    harness.pump.stop();
    expect(harness.pending.size).toBe(0);
  });
  it('does not upload the same frame repeatedly in the animation-frame fallback', () => {
    const harness = frameHarness(false);
    harness.pump.start();
    harness.tick(0, 1); harness.tick(100, 1); harness.tick(200, 1); harness.tick(300, 2);
    expect(harness.paint).toHaveBeenCalledTimes(2);
    harness.pump.stop();
    expect(harness.cancel).toHaveBeenCalled();
  });
  it('ignores a queued callback after pause, disposal, or a later restart', () => {
    const harness = frameHarness(true);
    harness.pump.start();
    const old = [...harness.pending.values()][0];
    harness.pump.stop(); old(100);
    expect(harness.paint).not.toHaveBeenCalled();
    expect(harness.pending.size).toBe(0);
    harness.pump.start(); old(200);
    expect(harness.paint).not.toHaveBeenCalled();
    expect(harness.pending.size).toBe(1);
    harness.tick(250);
    expect(harness.paint).toHaveBeenCalledOnce();
    harness.pump.stop();
  });
});
