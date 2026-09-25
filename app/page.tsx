import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, Check, CheckCheck, CircleDollarSign, ClipboardList, Gauge, LockKeyhole, Play, ScanLine, ShieldCheck } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
import { DecorativeVideo } from '@/components/decorative-video';
import { Reveal } from '@/components/reveal';
import { DEFAULT_BASKET, EXAMPLE_ASSETS } from '@/lib/demo/example';
import { formatUsdc, validatePlan } from '@/lib/domain/math';
import styles from './home.module.css';

const rows = validatePlan(DEFAULT_BASKET).allocations.map(allocation => ({ ...allocation, asset: EXAMPLE_ASSETS.find(asset => asset.mint === allocation.mint)!, amount: formatUsdc(allocation.usdcRaw).replace(/0000$/, '') }));
function SplitBar() { return <div className={styles.splitBar} role="img" aria-label="50 percent Apple, 30 percent Microsoft, 20 percent NVIDIA">{rows.map(row => <span key={row.mint} style={{ width: `${row.weightBps / 100}%` }} />)}</div>; }
function Signal() { return <div className={styles.signal} aria-label="Illustrative allocation signal, not a price chart"><div><span>YOUR ALLOCATION</span><strong><i /> 100% assigned</strong></div><svg viewBox="0 0 300 38" preserveAspectRatio="none" aria-hidden="true"><path d="M0 29 C35 29 36 24 58 25 S84 31 102 21 S128 20 146 23 S169 30 185 18 S211 16 226 18 S250 25 268 11 S289 10 300 5" /><circle cx="268" cy="11" r="3" /></svg></div>; }
const features = [
  { title: 'Verified assets', media: 'feature-verified', kicker: '01 / START WITH IDENTITY', text: 'Explore issuer-verified xStocks and ETFs on Solana. Each asset is matched to its exact mint, with its official logo.', link: 'Explore the catalog', href: '/app' },
  { title: 'Your chosen split', media: 'feature-split', kicker: '02 / MAKE IT YOURS', text: 'Choose up to ten assets. Set your own percentages. Every micro-USDC goes exactly where your split says it should.', link: 'Choose your split', href: '/app' },
  { title: 'A plan to keep', media: 'feature-keep', kicker: '03 / TAKE IT WITH YOU', text: 'Keep a draft on this device, share an exact plan link, or export a CSV. Optional accounts let you save plans across devices.', link: 'Try a shareable plan', href: '/app?mode=example' },
];
const steps = [
  ['Choose your split.', 'Choose verified xStocks from the catalog. Set the percentages for your new contribution.'],
  ['See what adds up.', 'Enter a USDC budget for quote estimates. Add a public wallet address to see your current units, too.'],
  ['Take the next step.', 'Copy or export your plan. Open Jupiter to independently review amounts and fees before trading.'],
];

export default function Home() {
  return <><SiteHeader /><main id="main" className={styles.home} data-design="kova">
    <section className={styles.hero} aria-labelledby="hero-heading">
      <DecorativeVideo className={styles.heroFilm} src="/media/design/hero-boomerang.mp4" mobileSrc="/media/design/hero-boomerang-mobile.mp4" poster="/media/design/hero-poster.jpg" label="Hero boomerang" priority />
      <div className={styles.ambient} aria-hidden="true"><i /><i /><span /></div>
      <div className={styles.heroCopy}>
        <p className={styles.kicker}>SMALL CONTRIBUTIONS. CLEAR INTENT.</p>
        <h1 id="hero-heading" className={styles.heroTitle}>Your next contribution,<br /><em>clearly.</em></h1>
        <p className={styles.heroDescription}>Choose your xStocks. Set your split. Review your next step.</p>
        <div className={styles.heroActions}><Link href="/app" className="button primary large">Make a plan <ArrowRight size={17} /></Link><Link href="/app?mode=example" className="button secondary large">Try the example <ArrowUpRight size={16} /></Link><Link href="/demo" className="text-button"><Play size={14} /> Watch demo</Link></div>
        <p className={styles.reassurance}><LockKeyhole size={13} /> Start without an account. No signatures.</p>
      </div>
      <div className={styles.previews} aria-label="Illustrative contribution plan">
        <Reveal className={styles.previewEntrance} delay={0}><article className={`${styles.preview} ${styles.contribution}`} data-preview="contribution">
          <div className={styles.windowBar}><span><i /><i /><i /></span> lotline / planner</div>
          <div className={styles.previewHeading}><h2>Your next contribution</h2><span className={styles.example}>Example</span></div>
          <p className={styles.amount}>1,000<span>.00</span> <small>USDC</small></p>
          <Signal /><SplitBar />
          <div className={styles.previewFoot}><CheckCheck size={16} /> Every micro-USDC accounted for</div>
        </article></Reveal>
        <Reveal className={styles.previewEntrance} delay={80}><article className={`${styles.preview} ${styles.chosen}`} data-preview="split">
          <div className={styles.windowBar}><span><i /><i /><i /></span> YOUR PLAN, AT A GLANCE</div>
          <div className={styles.previewHeading}><h2>Your chosen split</h2><span className={styles.example}>Example</span></div>
          <p className={styles.splitCaption}>A 1,000.00 USDC contribution</p>
          <div className={styles.rows}>{rows.map(row => <div className={styles.row} key={row.mint} data-preview-row>
            <Image src={row.asset.logoUrl!} alt="" width={34} height={34} unoptimized />
            <div><strong>{row.asset.symbol}</strong><span>{row.asset.name}</span></div>
            <span className={styles.weight}>{row.weightBps / 100}%</span><strong className={styles.rowAmount}>{row.amount}<small>USDC</small></strong>
          </div>)}</div><SplitBar /><div className={styles.previewFoot}><ShieldCheck size={15} /> Your percentages. Your decision.</div>
        </article></Reveal>
        <Reveal className={styles.previewEntrance} delay={160}><article className={`${styles.preview} ${styles.detail}`} data-preview="detail">
          <p className={styles.detailKicker}>EXAMPLE ALLOCATION DETAIL</p><h2>Before your<br />next step.</h2>
          <dl><div><dt>Contribution</dt><dd>1,000.00 USDC</dd></div><div><dt>Allocated</dt><dd>1,000.00 USDC</dd></div><div><dt>Unallocated</dt><dd>0.00 USDC</dd></div></dl>
          <p className={styles.ready}><Check size={15} /> Ready to review</p><p className={styles.detailNote}>Request a fresh estimate in the planner. No live quotes shown here.</p>
        </article></Reveal>
      </div>
      <div className={styles.assurances}><span><ShieldCheck size={14} /> Read-only by default</span><span><Gauge size={14} /> Micro-USDC precise</span></div>
      <p className={styles.disclosure}>Illustrative assets and amounts. No live quotes shown.</p>
    </section>
    <section className={styles.principles} aria-label="Lotline principles"><span><Check size={15} /> Issuer-verified assets</span><span><ScanLine size={15} /> Read-only wallet balances</span><span><CircleDollarSign size={15} /> Quote-only estimates</span><span><ClipboardList size={15} /> A plan you can keep</span></section>
    <section className={styles.features} id="features" aria-labelledby="features-heading">
      <Reveal effect="blur"><p className={styles.kicker}>BUILT AROUND YOUR NEXT STEP</p><h2 id="features-heading" className={styles.sectionTitle}>Less guesswork.<br /><em>More clarity.</em></h2></Reveal>
      <div className={styles.featureGrid}>{features.map((feature, index) => <Reveal className={styles.featureWrap} delay={index * 90} key={feature.title}><article className={styles.feature} data-feature={index + 1}>
        <DecorativeVideo className={styles.featureFilm} src={`/media/design/${feature.media}.mp4`} poster={`/media/design/${feature.media}-poster.jpg`} label={feature.title} />
        <p className={styles.featureKicker}>{feature.kicker}</p><h3>{feature.title}</h3><p>{feature.text}</p>
        {index === 1 && <SplitBar />}{index === 2 && <div className={styles.route} aria-hidden="true"><span>YOUR PLAN</span><i /><span>ANY SCREEN</span></div>}
        <Link href={feature.href} className="text-button">{feature.link} <ArrowRight size={16} /></Link>
      </article></Reveal>)}</div>
    </section>
    <section className={styles.how} aria-labelledby="how-heading">
      <Reveal><div className={styles.support}><DecorativeVideo src="/media/design/support.mp4" poster="/media/design/support-poster.jpg" label="A little room to think" /><p>A little room to think clearly.</p></div></Reveal>
      <Reveal delay={120}><p className={styles.kicker}>ONE CONTRIBUTION. THREE SIMPLE STEPS.</p><h2 id="how-heading" className={styles.sectionTitle}>How your<br /><em>plan works.</em></h2><ol className={styles.steps}>{steps.map(([title, text], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div><div className={styles.meter} aria-hidden="true"><i /><i /><i /></div></li>)}</ol><Link href="/how-it-works" className="text-button">A closer look at the details <ArrowRight size={16} /></Link></Reveal>
    </section>
    <section className={styles.everyday} aria-label="Precision and everyday access">
      <Reveal><p className={styles.kicker}>A LITTLE MORE PRECISION</p><h2>Every micro-USDC<br />has a place.</h2><p>Your percentages become exact allocations. Mint-aware estimates account for how xStocks display units on Solana.</p><div className={styles.precision}><span>10.000001 USDC</span><strong>5.000001 + 3 + 2</strong><small>A separate precision example · 50 / 30 / 20</small></div></Reveal>
      <Reveal delay={150}><p className={styles.kicker}>WHEREVER YOUR NEXT STEP TAKES YOU</p><h2>At home on<br />your home screen.</h2><p>Install Lotline on your phone or desktop. Explore the labeled Example offline; reconnect for fresh estimates and account sync.</p><div className={styles.devices} aria-hidden="true"><span /><span /><span /></div><a href="#install-lotline" className="text-button">Install Lotline <ArrowRight size={16} /></a></Reveal>
    </section>
    <Reveal className={styles.intent}><span className={styles.intentSymbol} aria-hidden="true">↗</span><div><p className={styles.kicker}><ShieldCheck size={13} /> YOUR KEYS. YOUR CALL.</p><h2>A plan, with you in control.</h2><p>Lotline splits your next contribution using percentages you choose. Your existing holdings stay in context. Every trading decision stays with you.</p></div><Link href="/app?mode=example" className="text-button">Try the example <ArrowRight size={16} /></Link></Reveal>
  </main><SiteFooter /></>;
}
