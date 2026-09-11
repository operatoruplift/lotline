import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
export default function NotFound() {
  return <><SiteHeader /><main id="main" className="route-state"><div><p className="eyebrow">404 / PAGE NOT FOUND</p><h1>Let’s get you back to your plan.</h1><p>This page does not exist or has moved.</p><Link href="/app" className="button primary">Make a plan</Link></div></main><SiteFooter /></>;
}
