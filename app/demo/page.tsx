import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
import release from '@/docs/video-release-manifest.json';

export const metadata: Metadata = { title: 'See Lotline in action' };

function durationLabel(seconds: number) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export default function DemoPage() {
  const { product, technical } = release.films;
  return <><SiteHeader /><main id="main" className="demo-page page-width">
    <p className="eyebrow">A SMALL PLAN. A CLEAR NEXT STEP.</p>
    <h1>See your next contribution<br />come together.</h1>
    <p className="demo-intro">Explore 832 Example assets, choose up to ten for a plan, and return to your split with a new contribution. This updated tour shows the current app. Example balances and estimates are synthetic; recorded Live estimates are dated observations.</p>
    <p className="eyebrow">PRODUCT TOUR · {durationLabel(product.durationSeconds)} · AINSLEY NARRATION</p>
    <video controls playsInline preload="metadata" poster={product.poster} aria-label="Lotline product tour" data-demo-video="product" className="demo-video">
      <source src={product.src} type="video/mp4" />
      <track default kind="captions" src={product.captions} srcLang="en" label="English" />
      Your browser cannot play this video. Use the interactive Example below.
    </video>
    <div className="demo-actions"><Link href="/app?mode=example" className="button primary">Try it yourself <ArrowRight size={16} /></Link><a href="#technical" className="text-button">Watch the technical walkthrough <ArrowRight size={16} /></a><a href={product.src} download className="text-button">Download product tour</a></div>
    <details className="demo-transcript"><summary>Read the product tour</summary><p>{product.transcript}</p></details>
    <section id="technical" className="demo-technical" aria-labelledby="technical-title">
      <p className="eyebrow">INSIDE THE PLANNER</p>
      <h2 id="technical-title">See how the numbers stay exact.</h2>
      <p className="demo-intro">Follow exact micro-USDC allocation, verified token units, quotes in batches of three, and freshness-aware exports. The walkthrough also explains device drafts, optional Supabase plans, and the public-only offline Example.</p>
      <p className="eyebrow">TECHNICAL WALKTHROUGH · {durationLabel(technical.durationSeconds)} · AINSLEY NARRATION</p>
      <video controls playsInline preload="metadata" poster={technical.poster} aria-label="Lotline technical walkthrough" data-demo-video="technical" className="demo-video">
        <source src={technical.src} type="video/mp4" />
        <track default kind="captions" src={technical.captions} srcLang="en" label="English" />
        Your browser cannot play this video. Read the walkthrough below.
      </video>
      <div className="demo-actions"><a href={technical.src} download className="text-button">Download technical walkthrough</a></div>
      <details className="demo-transcript"><summary>Read the technical walkthrough</summary><p>{technical.transcript}</p></details>
    </section>
  </main><SiteFooter /></>;
}
