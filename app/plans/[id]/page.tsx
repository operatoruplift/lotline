import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { z } from 'zod';
import { AppTabBar } from '@/components/app-tab-bar';
import { SharedPlan } from '@/components/gallery/shared-plan';
import { leadingWeights } from '@/lib/domain/gallery';
import { marketIdentity } from '@/lib/domain/markets';
import { bpsToPercent } from '@/lib/domain/rebalance';
import { marketsEnabled } from '@/lib/server/features';
import { galleryEnabled, readPublishedPlan } from '@/lib/server/gallery';

type Props = { params: Promise<{ id: string }> };

/** Link previews name the plan and its largest weights, and nothing else. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = z.uuid().safeParse((await params).id);
  const fallback: Metadata = { title: 'Community plan', robots: { index: false } };
  if (!galleryEnabled() || !id.success) return fallback;
  try {
    const plan = await readPublishedPlan(id.data);
    if (!plan || plan === 'unavailable') return fallback;
    const { shown, more } = leadingWeights(plan);
    const description = `${shown.map(item => `${marketIdentity(item.mint)?.symbol ?? 'Asset'} ${bpsToPercent(item.bps)}%`).join(' · ')}${more ? ` · +${more} more` : ''}. A split shared on Lotline; open it with your own budget.`;
    return { title: `${plan.name} · Community plan`, description, alternates: { canonical: `/plans/${plan.id}` }, openGraph: { title: `${plan.name} · Lotline community plan`, description } };
  } catch { return fallback; }
}

export default async function SharedPlanPage({ params }: Props) {
  await connection();
  const id = z.uuid().safeParse((await params).id);
  if (!galleryEnabled() || !id.success) notFound();
  const markets = marketsEnabled();
  return <><SharedPlan id={id.data} markets={markets} />{markets && <AppTabBar gallery />}</>;
}
