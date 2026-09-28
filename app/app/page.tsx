import type { Metadata } from 'next';
import { AppTabBar } from '@/components/app-tab-bar';
import { Planner } from '@/components/planner';
import { marketsEnabled } from '@/lib/server/features';

// Lighthouse flagged the site-wide canonical (the homepage) on this route; the
// planner is its own page, so it declares itself.
export const metadata: Metadata = { title: 'Make a plan', alternates: { canonical: '/app' } };

export default async function AppPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  const markets = marketsEnabled();
  return <><Planner initialMode={params.mode === 'example' ? 'example' : 'live'} marketsEnabled={markets} />{markets && <AppTabBar active="plan" />}</>;
}
