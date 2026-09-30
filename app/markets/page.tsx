import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AppTabBar } from '@/components/app-tab-bar';
import { Markets } from '@/components/markets/markets';
import { cryptoEnabled, marketsEnabled } from '@/lib/server/features';
import { galleryEnabled } from '@/lib/server/gallery';

export const metadata: Metadata = {
  title: 'Markets',
  description: 'Browse every verified xStock and PreStock with a dated market snapshot, and add assets to your contribution plan.',
  alternates: { canonical: '/markets' },
};

export default async function MarketsPage() {
  // The flag is read per request, so an operator switch never depends on a build.
  await connection();
  if (!marketsEnabled()) notFound();
  const gallery = galleryEnabled();
  return <><Markets crypto={cryptoEnabled()} gallery={gallery} /><AppTabBar active="markets" gallery={gallery} /></>;
}
