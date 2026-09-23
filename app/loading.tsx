import { BrandMark } from '@/components/brand-mark';
import Link from 'next/link';

export default function Loading() {
  return <main id="main" className="route-state">
    <div className="route-loading" role="status" aria-busy="true"><BrandMark className="route-loader" /><h1>Opening Lotline…</h1><p>Your next contribution, clearly.</p></div>
    <noscript>
      <style>{'.route-loading{display:none}'}</style>
      <div><h1>JavaScript is turned off.</h1><p>Enable JavaScript in your browser, then reload to open Lotline.</p><Link className="button secondary" href="/">Reload Lotline</Link></div>
    </noscript>
  </main>;
}
