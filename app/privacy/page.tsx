import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/site-shell';

export const metadata: Metadata = { title: 'Privacy & storage' };

export default function PrivacyPage() {
  return <><SiteHeader /><main id="main" className="privacy-page page-width">
    <p className="eyebrow">YOUR PLAN. CLEAR BOUNDARIES.</p>
    <h1>What Lotline stores.</h1>
    <p className="privacy-intro">You can plan without an account. Cloud saving is an optional action you choose.</p>
    <section><h2>On this device</h2><p>Your selected assets, percentages, and budget are saved in your browser’s local storage. Wallet addresses are not saved. Clearing your browser’s site data removes the local plan and downloaded offline Example.</p><p>The installable app keeps a public, synthetic Example and the code needed to run it offline. It does not cache Live API responses, account pages, or cloud plans for offline use.</p></section>
    <section><h2>When you create an account</h2><p>Supabase handles your email, password authentication, and session. Session cookies keep you signed in. When you explicitly save a named plan, its name, selected assets, percentages, and budget are stored with your account. Your wallet address and balance or quote results are not included.</p><p>Saved plans are restricted to their owner. You can load or delete your saved plans in the planner. Signing out ends the local session; it does not delete your saved cloud plans.</p></section>
    <section><h2>When you request Live data</h2><p>The server sends a public wallet address to the configured Solana RPC provider only when you load balances. It requests issuer metadata from xStocks and quote estimates from Jupiter. Quote requests contain token mints and the allocated USDC amount, with no wallet address or taker.</p><p>Providers and the hosting platform may retain operational and security logs under their own policies. Lotline does not add advertising trackers or analytics. Short-lived server caches help avoid repeated provider requests.</p></section>
    <section><h2>Your exports and external links</h2><p>Copied plans and CSV files remain under your control. A plan link contains its mode, budget, selected mints, and percentages in the URL fragment. Anyone with that link can read the split. It contains no wallet address, account identity, balance, or quote result. Opening a link asks you to review it before replacing your draft; Live estimates must be requested again.</p><p>Jupiter opens as a separate website with its own terms and privacy practices. Lotline cannot see whether you complete a trade there.</p><p>Lotline never requests a private key, seed phrase, signature, or permission to spend funds.</p></section>
    <Link href="/app" className="button primary">Back to your plan</Link>
  </main><SiteFooter /></>;
}
