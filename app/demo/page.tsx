import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';

export const metadata: Metadata = { title: 'See Lotline in action' };

export default function DemoPage() {
  return <><SiteHeader /><main id="main" className="demo-page page-width">
    <p className="eyebrow">A SMALL PLAN. A CLEAR NEXT STEP.</p>
    <h1>See your next contribution<br />come together.</h1>
    <p className="demo-intro">A 54-second tour of Lotline’s real Example interface. The amounts and estimates in this film are illustrative.</p>
    <video controls playsInline preload="metadata" aria-label="Lotline product tour, 54 seconds" className="demo-video">
      <source src="https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/b87047f8-d625-4416-b6f7-485f4c92b73e.mp4" type="video/mp4" />
      <track default kind="captions" src="/videos/pitch.en.vtt" srcLang="en" label="English" />
      Your browser cannot play this video. Use the interactive Example below.
    </video>
    <div className="demo-actions"><Link href="/app?mode=example" className="button primary">Try it yourself <ArrowRight size={16} /></Link><a href="#technical" className="text-button">Watch the technical walkthrough <ArrowRight size={16} /></a></div>
    <details className="demo-transcript"><summary>Read the product tour</summary><p>Your next contribution deserves a clear plan. Lotline helps you split USDC across the Solana xStocks you choose. Choose up to three verified assets. Set your percentages. Every micro-USDC is accounted for. Add a public wallet to read your balances, then see estimated units with xStocks’ onchain scaling. Copy your plan or download a CSV. Review current amounts and fees independently on Jupiter. A focused workspace for mobile and desktop. Start without an account. Lotline. A clear plan for your next xStocks contribution.</p></details>
    <section id="technical" className="demo-technical" aria-labelledby="technical-title">
      <p className="eyebrow">INSIDE THE PLANNER</p>
      <h2 id="technical-title">See how the numbers stay exact.</h2>
      <p className="demo-intro">A 2-minute, 40-second visual walkthrough of the code, verified token units, quote requests, account boundaries, and offline behavior. This film uses on-screen explanations without audio.</p>
      <video controls playsInline preload="metadata" aria-label="Lotline technical walkthrough, 2 minutes 40 seconds" className="demo-video">
        <source src="https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/73bd8c85-4fb7-4ba5-8b07-dd9eab8db488.mp4" type="video/mp4" />
        <track default kind="captions" src="/videos/technical.en.vtt" srcLang="en" label="English" />
        Your browser cannot play this video. Read the walkthrough below.
      </video>
      <details className="demo-transcript"><summary>Read the technical walkthrough</summary>
        <p>Lotline parses USDC as decimal strings and BigInt micro-units, then distributes leftover micro-USDC by largest remainder, breaking ties in basket order. The exact allocations always sum to the entered budget. Official issuer metadata identifies supported Solana mints. All matching raw token accounts are summed before the official Token-2022 Scaled UI Amount helper converts units using mint configuration and chain time.</p>
        <p>Jupiter receives only input mint, output mint, and raw amount. Quotes expire within 30 seconds, and edited plans reject obsolete responses. Optional Supabase accounts store explicitly saved budgets and splits under owner-only database policies. Shared provider slots bound request traffic across server instances. The PWA caches a public synthetic Example and static assets; live APIs and private account data require the network. Live verification used a real quote and an independently public address with confirmed zero holdings. Lotline never signs or submits a transaction.</p>
      </details>
    </section>
  </main><SiteFooter /></>;
}
