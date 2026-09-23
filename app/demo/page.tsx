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
    <p className="demo-intro">Explore 832 Example assets, choose up to ten for a plan, and return to your split with a new contribution. These narrated tours show the September 12, 2026 planner release. Example balances and estimates are synthetic; recorded Live estimates are dated observations.</p>
    <p className="demo-intro">The app now also offers a prefilled Jupiter handoff and saved manual contribution reminders. A supported mainnet order has now passed semantic validation and unsigned simulation. In-app purchases remain gated on production credentials and restricted participant access; real settlement is not yet verified. Below the narrated tours, a September 19 controlled demonstration shows the newer review, receipt and recovery screens with a fake wallet and mocked providers.</p>
    <section id="sponsor-demo" className="demo-technical" aria-labelledby="sponsor-demo-title">
      <p className="demo-intro">September 23 update: the PreStocks planner supports eight verified assets. The xStocks review checks Pyth freshness before mapped purchases and stops approvals when references expire. Its planning benchmark compares quoted share exposure with the underlying equity price using a separate USDC/USD conversion. Live Pyth access and real settlement still await external configuration. The dated rehearsal below shows the earlier unavailable-state flow, not the new benchmark.</p>
      <p className="eyebrow">SEPTEMBER 21, 2026 · PRESTOCKS AND PYTH</p>
      <h2 id="sponsor-demo-title">A separate plan. Clear source context.</h2>
      <p id="sponsor-demo-description" className="demo-intro">This silent, captioned rehearsal follows a PreStocks contribution from asset selection to exact allocation, issuer verification and a shared plan. It then shows an explicit Pyth-unavailable state in the xStocks planner. Catalogs, estimates and the unavailable response are controlled fixtures, labeled throughout. No wallet connects and no funds move; the clip does not claim a live oracle observation or a price comparison.</p>
      <video controls muted playsInline preload="metadata" poster="/videos/release-20260921/sponsor-planning-poster.jpg" aria-label="Lotline PreStocks and Pyth controlled rehearsal" aria-describedby="sponsor-demo-description" data-demo-video="sponsor-planning" className="demo-video">
        <source src="/videos/release-20260921/sponsor-planning.mp4" type="video/mp4" /><track default kind="captions" src="/videos/release-20260921/sponsor-planning.en.vtt" srcLang="en" label="English" />
      </video>
      <div className="demo-actions"><a href="/videos/release-20260921/sponsor-planning.mp4" download className="text-button">Download PreStocks and Pyth rehearsal</a><a href="/videos/release-20260921/sponsor-planning.transcript.txt" className="text-button">Read rehearsal description</a><Link href="/pre-ipo" className="button primary">Plan with PreStocks <ArrowRight size={16} /></Link></div>
    </section>
    <section className="demo-technical" aria-labelledby="current-demo-title">
      <p className="eyebrow">SEPTEMBER 20, 2026 · CURRENT APPLICATION</p>
      <h2 id="current-demo-title">From a first plan to a clear review.</h2>
      <p className="demo-intro">These new silent recordings show the current first-use journey and technical evidence screens. Catalog and quote responses in the UI rehearsal are controlled fixtures, labeled throughout. No wallet signs and no funds move. The separately documented unsigned mainnet simulation does not prove a completed purchase.</p>
      <video controls muted playsInline preload="metadata" poster="/videos/release-20260920/first-minute-poster.jpg" aria-label="Lotline current first-minute rehearsal" data-demo-video="first-minute" className="demo-video">
        <source src="/videos/release-20260920/first-minute.mp4" type="video/mp4" /><track default kind="captions" src="/videos/release-20260920/first-minute.en.vtt" srcLang="en" label="English" />
      </video>
      <div className="demo-actions"><a href="/videos/release-20260920/first-minute.mp4" download className="text-button">Download current walkthrough</a><a href="/videos/release-20260920/first-minute.transcript.txt" className="text-button">Read text description</a><Link href="/app" className="button primary">Plan your contribution <ArrowRight size={16} /></Link></div>
      <h3>Inspect the evidence behind the numbers.</h3>
      <video controls muted playsInline preload="none" poster="/videos/release-20260920/technical-proof-poster.jpg" aria-label="Lotline current technical evidence rehearsal" data-demo-video="technical-proof" className="demo-video">
        <source src="/videos/release-20260920/technical-proof.mp4" type="video/mp4" /><track default kind="captions" src="/videos/release-20260920/technical-proof.en.vtt" srcLang="en" label="English" />
      </video>
      <div className="demo-actions"><a href="/videos/release-20260920/technical-proof.mp4" download className="text-button">Download technical evidence tour</a><a href="/videos/release-20260920/technical-proof.transcript.txt" className="text-button">Read technical description</a></div>
    </section>
    <p className="eyebrow">PRODUCT TOUR · {durationLabel(product.durationSeconds)} · AINSLEY NARRATION</p>
    <video controls playsInline preload="metadata" poster={product.poster} aria-label="Lotline product tour" data-demo-video="product" className="demo-video">
      <source src={product.src} type="video/mp4" />
      <track default kind="captions" src={product.captions} srcLang="en" label="English" />
      Your browser cannot play this video. Use the interactive Example below.
    </video>
    <div className="demo-actions"><Link href="/app?mode=example" className="button primary">Try it yourself <ArrowRight size={16} /></Link><a href="#technical" className="text-button">Watch the technical walkthrough <ArrowRight size={16} /></a><a href="#controlled-demo" className="text-button">See the latest controlled demonstration <ArrowRight size={16} /></a><a href={product.src} download className="text-button">Download product tour</a></div>
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
    <section id="controlled-demo" className="demo-technical" aria-labelledby="controlled-demo-title">
      <p className="eyebrow">SEPTEMBER 19, 2026 · CONTROLLED DEMONSTRATION</p>
      <h2 id="controlled-demo-title">Review. Recover. Return next time.</h2>
      <p id="controlled-demo-description" className="demo-intro">This silent, 25-second recording shows the newer contribution flow running locally: exact review, separate receipts, recovery after an uncertain result, and a saved manual reminder. It uses a fake Wallet Standard wallet and mocked Jupiter and Solana responses. No funds moved. This is test evidence, not a real purchase or proof that mainnet execution is available.</p>
      <p className="eyebrow">CONTROLLED WALKTHROUGH · 0:25 · SILENT · NO FUNDS MOVED</p>
      <video controls muted playsInline preload="none" poster="/videos/release-20260919/execution-fixture-poster.png" aria-label="Lotline controlled contribution demonstration" aria-describedby="controlled-demo-description" data-demo-video="controlled" className="demo-video" style={{ aspectRatio: '36 / 25' }}>
        <source src="/videos/release-20260919/execution-fixture-walkthrough.mp4" type="video/mp4" />
        Your browser cannot play this video. Read the demonstration description below.
      </video>
      <div className="demo-actions"><a href="/videos/release-20260919/execution-fixture-walkthrough.mp4" download className="text-button">Download controlled demonstration</a><a href="/videos/release-20260919/execution-fixture-description.txt" download className="text-button">Download text description</a></div>
      <details className="demo-transcript"><summary>Read the controlled demonstration</summary><p>A persistent banner identifies the entire recording as a controlled test with mocked wallet and providers. A four-asset contribution is reviewed with exact USDC amounts, minimum raw token output, wallet, network and fees. Two simulated legs confirm. The third has an unknown result, so further approvals stop and the original receipts remain visible. After a reload, Lotline reconciles the original attempt, then resumes only the fourth leg. The completed receipts show historical raw amounts and can be downloaded. Finally, a manual review reminder saves the amount and split, and the recording shows the receipt and reminder layouts on smaller screens. No real transaction was signed or submitted. Every future real contribution would require a fresh review and explicit wallet approval once execution readiness requirements are met.</p></details>
    </section>
  </main><SiteFooter /></>;
}
