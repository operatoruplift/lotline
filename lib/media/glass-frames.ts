import { GLASS_LIMITS } from './glass-geometry';

type VideoClock = Pick<HTMLVideoElement, 'currentTime'> & Partial<Pick<HTMLVideoElement, 'requestVideoFrameCallback' | 'cancelVideoFrameCallback'>>;
type FrameClock = { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void };

/** One cancellable pump, preferring decoded frames and never retaining frames. */
export function glassFramePump(video: VideoClock, clock: FrameClock, paint: () => void) {
  const decoded = typeof video.requestVideoFrameCallback === 'function' && typeof video.cancelVideoFrameCallback === 'function';
  let generation = 0;
  let running = false;
  let handle: number | null = null;
  let lastPaint = -Infinity;
  let lastMediaTime = -Infinity;
  const interval = 1_000 / GLASS_LIMITS.fps;

  function schedule(revision: number) {
    const frame = (now: number) => {
      if (!running || revision !== generation) return;
      handle = null;
      if (now - lastPaint >= interval - 0.5 && video.currentTime !== lastMediaTime) {
        lastPaint = Number.isFinite(lastPaint) ? lastPaint + Math.max(1, Math.floor((now - lastPaint + 0.5) / interval)) * interval : now;
        lastMediaTime = video.currentTime;
        paint();
      }
      if (running && revision === generation) schedule(revision);
    };
    handle = decoded ? video.requestVideoFrameCallback!(frame) : clock.request(frame);
  }

  return {
    start() {
      if (running) return;
      running = true; lastPaint = -Infinity; lastMediaTime = -Infinity;
      schedule(++generation);
    },
    stop() {
      running = false; generation += 1;
      if (handle !== null) {
        if (decoded) video.cancelVideoFrameCallback!(handle);
        else clock.cancel(handle);
        handle = null;
      }
    },
  };
}
