import type { Metadata } from 'next';
import { AppTabBar } from '@/components/app-tab-bar';
import { Planner } from '@/components/planner';
import { marketsEnabled } from '@/lib/server/features';
import { galleryEnabled } from '@/lib/server/gallery';

// Lighthouse flagged the site-wide canonical (the homepage) on this route; the
// planner is its own page, so it declares itself.
export const metadata: Metadata = { title: 'Make a plan', alternates: { canonical: '/app' } };

export default async function AppPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  const markets = marketsEnabled();
  const gallery = galleryEnabled();
  return <><Planner initialMode={params.mode === 'example' ? 'example' : 'live'} marketsEnabled={markets} galleryEnabled={gallery} />{markets && <AppTabBar active="plan" gallery={gallery} />}</>;
}
