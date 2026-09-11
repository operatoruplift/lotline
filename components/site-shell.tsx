import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from './brand';

export function SiteHeader({ active }: { active?: 'app' | 'how' }) {
  return <header className="site-header"><div className="header-inner">
    <Brand />
    <nav aria-label="Main navigation">
      <Link href="/how-it-works" className={active === 'how' ? 'nav-link active' : 'nav-link'} aria-current={active === 'how' ? 'page' : undefined}>How it works</Link>
      <Link href="/sign-in" className="nav-link account-link">Sign in</Link>
      {active === 'app' ? <span className="network-badge"><span />Solana mainnet</span> : <Link className="header-cta" href="/app">Make a plan <ArrowUpRight size={15} /></Link>}
    </nav>
  </div></header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="footer-inner">
    <div><Brand /><p>A little clarity for your next contribution.</p></div>
    <div className="footer-right"><nav aria-label="Footer navigation"><Link href="/how-it-works">How it works</Link><Link href="/demo">Demo</Link><Link href="/privacy">Privacy & storage</Link><a href="#install-lotline">Install app</a><a href="https://github.com/operatoruplift/lotline" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></nav><p>Made for Solana. Planning only. You review every trade.</p></div>
  </div></footer>;
}
