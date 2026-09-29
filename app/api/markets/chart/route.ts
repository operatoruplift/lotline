import { CHART_RANGES, marketIdentities, type ChartRange } from '@/lib/domain/markets';
import { safeMessage, ServiceError } from '@/lib/server/common';
import { cryptoEnabled, marketsEnabled } from '@/lib/server/features';
import { readChart } from '@/lib/server/market-chart';
import { enforceReadRateLimit } from '@/lib/server/read-limits';
import { noStore } from '@/lib/server/requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Price history for one catalog asset. Any other address is refused before a provider is contacted. */
export async function GET(request: Request) {
  if (!marketsEnabled()) return Response.json({ state: 'unavailable', message: 'Markets are not enabled on this deployment.' }, { status: 404, headers: noStore });
  const params = new URL(request.url).searchParams;
  const mint = params.get('mint') ?? '';
  const range = (params.get('range') ?? '1d') as ChartRange;
  if ([...params.keys()].some(key => key !== 'mint' && key !== 'range') || params.getAll('mint').length !== 1 || params.getAll('range').length > 1 ||
      // Only what Markets lists: crypto charts need the crypto flag too.
      !marketIdentities(cryptoEnabled()).some(identity => identity.mint === mint) || !CHART_RANGES.includes(range)) {
    return Response.json({ state: 'invalid-input', message: 'Choose one catalog asset and a range of 1d, 7d or 30d.' }, { status: 400, headers: noStore });
  }
  try {
    await enforceReadRateLimit(request);
    const chart = await readChart(mint, range);
    return Response.json(chart, { headers: chart.state === 'success'
      ? { 'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1200', 'X-Content-Type-Options': 'nosniff' }
      : noStore });
  } catch (error) {
    const limited = error instanceof ServiceError && error.reasonCode === 'rate-limited';
    return Response.json({ state: 'unavailable', message: safeMessage(error) }, { status: limited ? 429 : 503, headers: noStore });
  }
}
