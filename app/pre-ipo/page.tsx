import type { Metadata } from 'next';
import { AppTabBar } from '@/components/app-tab-bar';
import { Planner } from '@/components/planner';
import { marketsEnabled } from '@/lib/server/features';

export const metadata: Metadata = { title: 'Plan a PreStocks contribution', description: 'Build a USDC contribution split using verified PreStocks Solana mints and read-only estimates.', alternates: { canonical: '/pre-ipo' } };

export default function PreIpoPage() {
  const markets = marketsEnabled();
  return <><Planner initialMode="live" universe="prestocks" cloudEnabled={false} marketsEnabled={markets} />{markets && <AppTabBar active="pre-ipo" />}</>;
}
