import type { Metadata } from 'next';
import { AppTabBar } from '@/components/app-tab-bar';
import { Planner } from '@/components/planner';
import { marketsEnabled } from '@/lib/server/features';
import { galleryEnabled } from '@/lib/server/gallery';

export const metadata: Metadata = { title: 'Plan a PreStocks contribution', description: 'Build a USDC contribution split using verified PreStocks Solana mints and read-only estimates.', alternates: { canonical: '/pre-ipo' } };

export default function PreIpoPage() {
  const markets = marketsEnabled();
  const gallery = galleryEnabled();
  return <><Planner initialMode="live" universe="prestocks" cloudEnabled={false} marketsEnabled={markets} galleryEnabled={gallery} />{markets && <AppTabBar active="pre-ipo" gallery={gallery} />}</>;
}
