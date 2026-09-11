import type { Metadata } from 'next';
import { Planner } from '@/components/planner';

// This is the only HTML document the service worker stores. It must remain
// public and independent of cookies, account data, balances, and live quotes.
export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Offline Example', robots: { index: false, follow: true } };

export default function OfflinePage() {
  return <Planner initialMode="example" cloudEnabled={false} />;
}
