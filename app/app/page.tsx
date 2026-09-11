import type { Metadata } from 'next';
import { Planner } from '@/components/planner';

export const metadata: Metadata = { title: 'Make a plan' };

export default async function AppPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  return <Planner initialMode={params.mode === 'example' ? 'example' : 'live'} />;
}
