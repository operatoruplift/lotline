import type { Metadata } from 'next';
import { Planner } from '@/components/planner';

// Lighthouse flagged the site-wide canonical (the homepage) on this route; the
// planner is its own page, so it declares itself.
export const metadata: Metadata = { title: 'Make a plan', alternates: { canonical: '/app' } };

export default async function AppPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  return <Planner initialMode={params.mode === 'example' ? 'example' : 'live'} />;
}
