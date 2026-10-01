'use client';

import { useEffect, useRef } from 'react';
import { ArrowDownToLine, ArrowRight, Music2 } from 'lucide-react';
import styles from './launch-film.module.css';

const MEDIA = '/videos/launch-20261001';

export function LaunchFilm() {
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const main = player.current?.closest('main');
    if (!main) return;
    // Native play does not bubble. Capture it so a newly started film pauses
    // the other tours, including the archive, before their audio can overlap.
    const play = (event: Event) => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      for (const video of main.querySelectorAll('video')) {
        if (video !== event.target) video.pause();
      }
    };
    main.addEventListener('play', play, true);
    return () => main.removeEventListener('play', play, true);
  }, []);

  return <section id="launch-film" className={styles.film} aria-labelledby="launch-film-title">
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>THE LAUNCH FILM</p><h2 id="launch-film-title">A small plan. A clear next step.</h2></div>
      <span className={styles.duration}><Music2 size={15} aria-hidden="true" /> 0:30 · Music &amp; motion</span>
    </div>
    <video ref={player} className={styles.video} controls playsInline preload="none" poster={`${MEDIA}/launch-film-poster.jpg`} aria-label="Lotline animated launch film" aria-describedby="launch-film-context" data-demo-video="launch">
      <source src={`${MEDIA}/launch-film.mp4`} type="video/mp4" />
      <track default kind="captions" src={`${MEDIA}/launch-film.en.vtt`} srcLang="en" label="English scene captions" />
      Your browser cannot play this film. Read its text description below.
    </video>
    <div className={styles.footer}>
      <p id="launch-film-context">An animated introduction to contribution planning, with music and no narration. Figures are illustrative; this film does not show a mainnet purchase. Explore the recorded app tours below.</p>
      <div className={styles.links}><a href={`${MEDIA}/launch-film.mp4`} download><ArrowDownToLine size={16} aria-hidden="true" /> Save launch film</a><a href={`${MEDIA}/launch-film.transcript.txt`}>Read film description <ArrowRight size={15} aria-hidden="true" /></a></div>
    </div>
    <details className={styles.notes}><summary>Film details &amp; credits</summary><p>Released October 1, 2026. Animated screens illustrate the planning experience; they are not a recording of a transaction. The 832 identities refer to the issuer and Solana mint snapshot verified September 12. Availability and trading routes are checked separately in the app.</p><p>Original music and sound effects are preserved. Music: “Fashion” by The_Mountain, via Pixabay. <a href={`${MEDIA}/launch-film.transcript.txt`}>Read the scene-by-scene description and credits.</a></p></details>
  </section>;
}
