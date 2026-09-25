import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from './brand';
import { DecorativeVideo } from './decorative-video';
import { Reveal } from './reveal';
import styles from './site-shell.module.css';

export function SiteHeader({ active, dataMode }: { active?: 'app' | 'how' | 'pre-ipo'; dataMode?: 'example' | 'live' }) {
  return <header className={`site-header ${styles.header}`}><div className={styles.headerInner}>
    <Brand /><nav aria-label="Main navigation">
      <Link href="/how-it-works" className={active === 'how' ? 'nav-link active' : 'nav-link'} aria-current={active === 'how' ? 'page' : undefined}>How it works</Link>
      <Link href={active === 'pre-ipo' ? '/app' : '/pre-ipo'} className="nav-link">{active === 'pre-ipo' ? 'xStocks' : 'Pre-IPO'}</Link>
      <Link href="/sign-in" className="nav-link account-link">Sign in</Link>
      {active === 'app' || active === 'pre-ipo' ? <span className={`network-badge${dataMode === 'example' ? ' network-example' : ''}`}><span />{dataMode === 'example' ? 'Synthetic example' : 'Solana mainnet'}</span> : <Link className="header-cta" href="/app">Make a plan <ArrowUpRight size={15} /></Link>}
    </nav>
  </div></header>;
}

export function SiteFooter() {
  return <footer className={`site-footer ${styles.footer}`} data-design="heritage-grove">
    <div className={styles.footerCopy}>
      <div><Reveal effect="footer"><Brand /></Reveal><Reveal effect="footer" delay={80}><h2>A clearer<br /><em>next step.</em></h2></Reveal><Reveal effect="footer" delay={160}><p>A little clarity for your next contribution.</p></Reveal></div>
      <div className={styles.footerRight}><Reveal effect="footer" delay={160}><nav aria-label="Footer navigation"><Link href="/how-it-works">How it works</Link><Link href="/demo">Demo</Link><Link href="/brand-kit">Brand kit</Link><Link href="/privacy">Privacy & storage</Link><a href="#install-lotline">Install app</a><a href="https://github.com/operatoruplift/lotline" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></nav></Reveal><Reveal effect="footer" delay={240}><p>Made for Solana. Planning only.<br />You review every trade.</p></Reveal></div>
    </div>
    <Reveal className={styles.footerMedia} effect="fade"><DecorativeVideo src="/media/design/footer-landscape.mp4" poster="/media/design/footer-landscape-poster.jpg" label="Footer landscape" /></Reveal>
  </footer>;
}
