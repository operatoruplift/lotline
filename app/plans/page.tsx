import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AppTabBar } from '@/components/app-tab-bar';
import { Gallery } from '@/components/gallery/gallery';
import { marketsEnabled } from '@/lib/server/features';
import { galleryEnabled } from '@/lib/server/gallery';

export const metadata: Metadata = {
  title: 'Community plans',
  description: 'Splits Lotline members chose to share, ranked by how often others copied them. Names and weights only; never budgets, balances or wallets.',
  alternates: { canonical: '/plans' },
};

export default async function PlansPage() {
  await connection();
  if (!galleryEnabled()) notFound();
  const markets = marketsEnabled();
  return <><Gallery markets={markets} />{markets && <AppTabBar gallery />}</>;
}
