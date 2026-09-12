import { BrandMark } from '@/components/brand-mark';

export default function Loading() {
  return <main id="main" className="route-state" aria-busy="true"><div role="status"><BrandMark className="route-loader" /><h1>Opening Lotline…</h1><p>Your next contribution, clearly.</p></div></main>;
}
