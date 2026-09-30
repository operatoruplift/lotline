'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, Film, Layers } from 'lucide-react';
import styles from './demo-showcase.module.css';

type FilmDetails = { src: string; poster: string; captions: string; transcript: string; durationSeconds: number; audio: boolean; chapters: { at: number; title: string }[] };
type FilmId = 'product' | 'technical';
const IDS: FilmId[] = ['product', 'technical'];
const LABELS = { product: 'Explore the app', technical: 'Inside the contribution' };
function duration(value: number) { const seconds = Math.round(value); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

export function DemoArchive({ children, className }: { children: ReactNode; className: string }) {
  return <details className={className} data-demo-archive onToggle={event => {
    if (!event.currentTarget.open) event.currentTarget.querySelectorAll('video').forEach(video => video.pause());
  }}>{children}</details>;
}

export function DemoShowcase({ films }: { films: Record<FilmId, FilmDetails> }) {
  const [selected, setSelected] = useState<FilmId>('product');
  const videos = useRef<Partial<Record<FilmId, HTMLVideoElement | null>>>({});
  const tabs = useRef<Partial<Record<FilmId, HTMLButtonElement | null>>>({});
  function select(id: FilmId) {
    for (const video of Object.values(videos.current)) video?.pause();
    setSelected(id);
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, id: FilmId) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'product' : event.key === 'End' ? 'technical' : IDS[(IDS.indexOf(id) + 1) % IDS.length];
    select(next);
    tabs.current[next]?.focus();
  }
  return <section className={styles.showcase} aria-label="September 30 app tours">
    <div className={styles.tabs} role="tablist" aria-label="Choose a tour">
      {IDS.map(id => <button key={id} ref={node => { tabs.current[id] = node; }} type="button" role="tab" id={`tour-tab-${id}`} aria-controls={`tour-panel-${id}`} aria-selected={selected === id} tabIndex={selected === id ? 0 : -1} onClick={() => select(id)} onKeyDown={event => move(event, id)}>
        {id === 'product' ? <Film size={19} aria-hidden="true" /> : <Layers size={19} aria-hidden="true" />}<span><strong>{LABELS[id]}</strong><small>{duration(films[id].durationSeconds)} · {films[id].audio ? 'Narrated' : 'Caption-led'}</small></span><ArrowRight size={17} aria-hidden="true" />
      </button>)}
    </div>
    {IDS.map(id => {
      const film = films[id];
      return <section key={id} id={`tour-panel-${id}`} role="tabpanel" aria-labelledby={`tour-tab-${id}`} hidden={selected !== id} tabIndex={0}>
        <video ref={node => { videos.current[id] = node; }} className={styles.video} controls playsInline preload={id === 'product' ? 'metadata' : 'none'} poster={film.poster} aria-label={`Lotline September 30 ${id} tour`} aria-describedby="current-tour-context" data-demo-video={`current-${id}`}>
          <source src={film.src} type="video/mp4" /><track default kind="captions" src={film.captions} srcLang="en" label="English descriptions" />
        </video>
        <div className={styles.filmFooter}><p>{id === 'product' ? 'Portfolio, discovery, exact planning and a workspace that fits your phone.' : 'Follow exact allocation, source boundaries and the checks before a supported purchase.'}</p><a href={film.src} download><ArrowDownToLine size={16} aria-hidden="true" /> Save video</a><a href={film.transcript}>Read description <ArrowRight size={15} aria-hidden="true" /></a></div>
        <div className={styles.chapters} aria-label={`${LABELS[id]} chapters`}>{film.chapters.map(chapter => <button key={chapter.at} type="button" onClick={() => { const video = videos.current[id]; if (video) { video.currentTime = chapter.at; video.focus(); } }}><span>{duration(chapter.at)}</span>{chapter.title}</button>)}</div>
      </section>;
    })}
    <p id="current-tour-context" className={styles.context}>Recorded September 30, 2026. Actual app footage; Example figures are synthetic. Technical explanation slides are labeled. No wallet connected and no funds moved. These tours are caption-led; earlier narrated films remain in the archive.</p>
    <div className={styles.try}><div><strong>Make your own next step.</strong><span>Try the complete Example without a wallet or account.</span></div><Link href="/app?mode=example" className="button primary">Try the app <ArrowRight size={17} aria-hidden="true" /></Link></div>
  </section>;
}
