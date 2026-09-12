import Link from 'next/link';
import Image from 'next/image';
import { Activity, ArrowRight, ArrowUpRight, Check, CheckCheck, CircleDollarSign, ClipboardList, Gauge, LockKeyhole, ScanLine, ShieldCheck, Sparkles } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
import { logoPathForSymbol } from '@/lib/domain/assets';

const previewRows = [
  { initial: 'A', symbol: 'AAPLx', name: 'Apple xStock', share: '50', amount: '500.00', units: '2.500000', cls: 'apple' },
  { initial: 'M', symbol: 'MSFTx', name: 'Microsoft xStock', share: '30', amount: '300.00', units: '0.750000', cls: 'microsoft' },
  { initial: 'N', symbol: 'NVDAx', name: 'NVIDIA xStock', share: '20', amount: '200.00', units: '1.600000', cls: 'nvidia' },
];

export default function Home() {
  return <><SiteHeader /><main id="main" className="landing-page">
    <section className="hero page-width">
      <div className="hero-ambient" aria-hidden="true"><span className="ambient-orb ambient-orb-one" /><span className="ambient-orb ambient-orb-two" /><span className="ambient-grid" /></div>
      <div className="hero-copy">
        <div className="eyebrow hero-eyebrow"><span className="eyebrow-rule" /> SMALL CONTRIBUTIONS. CLEAR INTENT. <span className="hero-status"><span className="hero-status-dot" /> LIVE PLANNER</span></div>
        <h1>A clear plan for<br />your next <span>xStocks</span><br />contribution.</h1>
        <p className="hero-description">Your assets. Your percentages. See how your next USDC contribution adds up, then take the plan with you.</p>
        <div className="hero-actions"><Link href="/app" className="button primary large">Make a plan <ArrowRight size={17} /></Link><Link href="/app?mode=example" className="text-button">Try the example <ArrowUpRight size={16} /></Link></div>
        <div className="hero-reassurance"><LockKeyhole size={14} /><span>Start without an account. No signatures.</span></div>
        <div className="hero-proof-list" aria-label="Lotline planner details"><div><strong>3</strong><span>example<br />assets</span></div><div><strong>1</strong><span>read-only<br />wallet view</span></div><div><strong>0</strong><span>custody<br />required</span></div></div>
      </div>
      <div className="hero-visual">
        <div className="preview-topline"><span className="tiny-dot" /> A SMALL PLAN. A CLEAR NEXT STEP.</div>
        <div className="preview-card-stack"><div className="product-preview" aria-label="Illustrative contribution plan">
          <div className="preview-window-bar" aria-hidden="true"><span><i /><i /><i /></span><small>lotline / planner</small><span className="window-live"><span /> synced</span></div>
          <div className="preview-heading"><span>Your next contribution</span><span className="example-pill">Example</span></div>
          <div className="preview-amount">1,000<span>.00</span> <small>USDC</small></div>
          <div className="preview-signal" aria-hidden="true"><div className="signal-copy"><span>ALLOCATION SIGNAL</span><strong><span className="signal-pulse" /> Balanced</strong></div><svg viewBox="0 0 300 38" preserveAspectRatio="none"><path className="signal-track" d="M0 29 C35 29 36 24 58 25 S84 31 102 21 S128 20 146 23 S169 30 185 18 S211 16 226 18 S250 25 268 11 S289 10 300 5" /><path className="signal-path" d="M0 29 C35 29 36 24 58 25 S84 31 102 21 S128 20 146 23 S169 30 185 18 S211 16 226 18 S250 25 268 11 S289 10 300 5" /><circle cx="268" cy="11" r="3" /></svg></div>
          <div className="allocation-bar" role="img" aria-label="50 percent Apple, 30 percent Microsoft, 20 percent NVIDIA"><span style={{ width: '50%' }} /><span style={{ width: '30%' }} /><span style={{ width: '20%' }} /></div>
          <div className="preview-labels"><span>YOUR SPLIT</span><span>CONTRIBUTION</span></div>
          {previewRows.map((row) => <div className="preview-row" key={row.symbol}><span className={`asset-avatar ${row.cls}`}>{logoPathForSymbol(row.symbol) ? <Image className="asset-logo" src={logoPathForSymbol(row.symbol)!} alt="" width={36} height={36} unoptimized /> : row.initial}</span><div className="preview-asset"><strong>{row.symbol}</strong><span>{row.name}</span></div><span className="preview-weight">{row.share}%</span><strong className="preview-usdc">{row.amount}<small>USDC</small></strong></div>)}
          <div className="preview-bottom"><span><CheckCheck size={15} /> Every micro-USDC accounted for</span><ArrowUpRight size={17} /></div>
        </div></div>
        <div className="preview-assurances"><div className="preview-float-chip"><ShieldCheck size={13} /><span>Read-only by default</span></div><div className="preview-float-chip"><Gauge size={13} /><span>Micro-USDC precise</span></div></div>
        <div className="preview-note"><span className="annotation-line" /> Your contribution split. Set by you.</div>
        <p className="preview-disclosure">Illustrative assets and amounts. No live quotes shown.</p>
      </div>
    </section>
    <section className="trust-strip page-width" aria-label="Lotline principles"><span><Check size={15} /> Issuer-verified assets</span><span><ScanLine size={15} /> Read-only wallet balances</span><span><CircleDollarSign size={15} /> Quote-only estimates</span><span><ClipboardList size={15} /> A plan you can keep</span></section>
    <section className="steps-section page-width">
      <div className="section-heading"><div><p className="eyebrow">LESS GUESSWORK. MORE CLARITY.</p><h2>One contribution.<br />Three simple steps.</h2></div><p>A focused tool for the assets you already have in mind.</p></div>
      <div className="steps-grid">
        <article className="motion-card"><span className="step-number">01</span><span className="step-signal"><Sparkles size={12} /> START HERE</span><h3>Choose your split.</h3><p>Choose verified xStocks from the catalog. Set the percentages for your new contribution.</p><div className="step-meter" aria-hidden="true"><span /><span /><span /></div></article>
        <article className="motion-card"><span className="step-number">02</span><span className="step-signal"><Activity size={12} /> SEE IT ADD UP</span><h3>See what adds up.</h3><p>Enter a USDC budget for quote estimates. Add a public wallet address to see your current units, too.</p><div className="step-meter step-meter-mid" aria-hidden="true"><span /><span /><span /></div></article>
        <article className="motion-card"><span className="step-number">03</span><span className="step-signal"><ArrowUpRight size={12} /> TAKE IT WITH YOU</span><h3>Take the next step.</h3><p>Copy or export your plan. Open Jupiter to independently review amounts and fees before trading.</p><div className="step-meter step-meter-last" aria-hidden="true"><span /><span /><span /></div></article>
      </div>
    </section>
    <section className="everyday-section page-width" id="features">
      <div className="section-heading"><div><p className="eyebrow">BUILT AROUND YOUR NEXT STEP</p><h2>Small details.<br />A clearer plan.</h2></div><p>Everything you need to plan with care, wherever you are.</p></div>
      <div className="everyday-grid">
        <article className="motion-card feature-card"><span className="feature-kicker">01 / PRECISION</span><h3>Every micro-USDC has a place.</h3><p>Your percentages become exact allocations. Mint-aware estimates account for how xStocks display units on Solana.</p><div className="precision-example"><span>10.000001 USDC</span><strong>5.000001 + 3 + 2</strong><small>Example split · 50 / 30 / 20</small></div></article>
        <article className="motion-card feature-card"><span className="feature-kicker">02 / CONTINUITY</span><h3>A plan you can pass along.</h3><p>Your draft saves on this device. Copy a plan link to open the same exact budget and split on another screen. No account needed.</p><div className="feature-route" aria-hidden="true"><span>YOUR PLAN</span><i /><span>ANY SCREEN</span></div><Link href="/app?mode=example" className="text-button">Try a shareable plan <ArrowRight size={16} /></Link></article>
        <article className="motion-card feature-card"><span className="feature-kicker">03 / EVERYDAY ACCESS</span><h3>At home on your home screen.</h3><p>Install Lotline on your phone or desktop. Explore the labeled Example offline; reconnect for fresh estimates and account sync.</p><div className="feature-device" aria-hidden="true"><span /><span /><span /></div><a href="#install-lotline" className="text-button">Install Lotline <ArrowRight size={16} /></a></article>
      </div>
    </section>
    <section className="intent-section page-width"><span className="intent-symbol" aria-hidden="true">↗</span><div><span className="intent-kicker"><ShieldCheck size={13} /> YOUR KEYS. YOUR CALL.</span><h2>A plan, with you in control.</h2><p>Lotline splits your next contribution using percentages you choose. Your existing holdings stay in context. Every trading decision stays with you.</p></div><Link href="/app?mode=example" className="text-button">Try the example <ArrowRight size={16} /></Link></section>
  </main><SiteFooter /></>;
}
