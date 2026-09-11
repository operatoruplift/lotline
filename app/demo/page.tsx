import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';

export const metadata: Metadata = { title: 'See Lotline in action' };

export default function DemoPage() {
  return <><SiteHeader /><main id="main" className="demo-page page-width">
    <p className="eyebrow">A SMALL PLAN. A CLEAR NEXT STEP.</p>
    <h1>See your next contribution<br />come together.</h1>
    <p className="demo-intro">A 54-second tour of Lotline’s real Example interface. The amounts and estimates in this film are illustrative.</p>
    <video controls playsInline preload="metadata" aria-label="Lotline product tour, 54 seconds" className="demo-video">
      <source src="https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/a669773a-6a53-4db3-9797-172a20bd3ab4.mp4" type="video/mp4" />
      <track default kind="captions" src="/videos/pitch.en.vtt" srcLang="en" label="English" />
      Your browser cannot play this video. Use the interactive Example below.
    </video>
    <div className="demo-actions"><Link href="/app?mode=example" className="button primary">Try it yourself <ArrowRight size={16} /></Link><a href="https://scrimba.com/explain/guide00s6b8rut?fullscreen=1" target="_blank" rel="noopener noreferrer" className="text-button">Watch the technical walkthrough <ArrowUpRight size={16} /><span className="sr-only"> (opens in a new tab)</span></a></div>
    <details className="demo-transcript"><summary>Read the product tour</summary><p>Lotline makes a clear plan for your next xStocks contribution. Choose up to three issuer-verified assets and set your own percentages. A 10.000001 USDC budget split 50/30/20 becomes exactly 5.000001, 3, and 2 USDC. Read current holdings with a public wallet address, and request moment-in-time estimates. Example mode uses synthetic data. Copy or download your plan, then independently review amounts and fees on Jupiter. Use Lotline on your phone or desktop. No signatures or transactions are requested.</p></details>
  </main><SiteFooter /></>;
}
