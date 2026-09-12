export type PlaybackConditions = { allowed: boolean; inView: boolean; sourceReady: boolean; failed: boolean };
export function shouldPlayDecorativeVideo({ allowed, inView, sourceReady, failed }: PlaybackConditions): boolean {
  return allowed && inView && sourceReady && !failed;
}
type Video = Pick<HTMLVideoElement, 'play' | 'pause'>;
const owners = new WeakMap<Video, object>();
/** A stale play promise may pause an abandoned scene, but never a newer playback owner. */
export function controlPlayback(video: Video, shouldPlay: boolean, rejected: () => void): () => void {
  const owner = {};
  owners.set(video, owner);
  let cancelled = false;
  if (!shouldPlay) video.pause();
  else {
    try {
      void video.play().then(() => { if (cancelled && !owners.has(video)) video.pause(); }).catch(() => { if (!cancelled && owners.get(video) === owner) rejected(); });
    } catch { if (!cancelled && owners.get(video) === owner) rejected(); }
  }
  return () => {
    cancelled = true;
    if (owners.get(video) === owner) { owners.delete(video); video.pause(); }
  };
}
