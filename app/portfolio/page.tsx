import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AppTabBar } from '@/components/app-tab-bar';
import { Portfolio } from '@/components/portfolio/portfolio';
import { galleryEnabled } from '@/lib/server/gallery';
import { marketsEnabled } from '@/lib/server/features';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Your contribution plan at a glance: the split, what it holds by type, today’s moves and your next review. Read from this device only.',
  alternates: { canonical: '/portfolio' },
};

export default async function PortfolioPage() {
  // The flag is read per request, so an operator switch never depends on a build.
  await connection();
  if (!marketsEnabled()) notFound();
  const gallery = galleryEnabled();
  return <><Portfolio gallery={gallery} /><AppTabBar active="portfolio" gallery={gallery} /></>;
}
