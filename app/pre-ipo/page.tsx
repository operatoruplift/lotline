import type { Metadata } from 'next';
import { Planner } from '@/components/planner';

export const metadata: Metadata = { title: 'Plan a PreStocks contribution', description: 'Build a USDC contribution split using verified PreStocks Solana mints and read-only estimates.', alternates: { canonical: '/pre-ipo' } };

export default function PreIpoPage() {
  return <Planner initialMode="live" universe="prestocks" cloudEnabled={false} />;
}
