import type { MarketSnapshot } from '@/lib/domain/markets';

export type SnapshotLoad = { state: 'ready'; snapshot: MarketSnapshot } | { state: 'failed'; message: string };

/** Accept only a well-formed snapshot: every figure is a finite number or null. */
export function validSnapshot(value: unknown): value is MarketSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MarketSnapshot>;
  const number = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return (candidate.state === 'success' || candidate.state === 'partial') && typeof candidate.fetchedAt === 'string' && Number.isFinite(Date.parse(candidate.fetchedAt)) &&
    !!candidate.stats && typeof candidate.stats === 'object' && Object.values(candidate.stats).every(stats => !!stats && typeof stats === 'object' &&
      number(stats.price) && number(stats.change24hPct) && number(stats.volume24hUsd) && number(stats.liquidityUsd) && number(stats.marketCapUsd) && number(stats.holders));
}

/** The dated market snapshot behind Markets and the Portfolio home. Failure is a message, never an exception. */
export async function fetchMarketSnapshot(signal: AbortSignal): Promise<SnapshotLoad> {
  try {
    const response = await fetch('/api/markets', { signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]) });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && validSnapshot(body)) return { state: 'ready', snapshot: body };
    const message = body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : 'Market data is temporarily unavailable.';
    return { state: 'failed', message };
  } catch {
    return { state: 'failed', message: 'Market data could not be loaded. Check your connection and retry.' };
  }
}
