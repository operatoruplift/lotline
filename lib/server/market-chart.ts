import 'server-only';
import { z } from 'zod';
import type { ChartPoint, ChartRange, ChartResponse } from '../domain/markets';
import { BoundedCache, fetchJson, ServiceError, SpacedQueue } from './common';

const API = 'https://api.geckoterminal.com/api/v2';
const RANGES: Record<ChartRange, { timeframe: 'hour' | 'day'; aggregate: number; limit: number; spanMs: number }> = {
  '1d': { timeframe: 'hour', aggregate: 1, limit: 24, spanMs: 24 * 3_600_000 },
  '7d': { timeframe: 'hour', aggregate: 4, limit: 42, spanMs: 7 * 24 * 3_600_000 },
  '30d': { timeframe: 'day', aggregate: 1, limit: 30, spanMs: 30 * 24 * 3_600_000 },
};
/** Pools with less locked value than this give prices that are too easy to move. */
export const MIN_CHART_POOL_USD = 1_000;
const CHART_TTL_MS = 10 * 60_000;
const POOL_TTL_MS = 60 * 60_000;
// GeckoTerminal's public tier allows 30 calls a minute; 2.1 s spacing stays under it.
const queue = new SpacedQueue(2100, 8);
const poolCache = new BoundedCache<{ address: string; name: string } | null>(1_000);
const chartCache = new BoundedCache<ChartResponse>(3_000);

const poolsSchema = z.object({ data: z.array(z.object({
  attributes: z.object({ address: z.string().max(64), name: z.string().max(120), reserve_in_usd: z.string().max(40).nullable().optional() }),
  relationships: z.object({ base_token: z.object({ data: z.object({ id: z.string().max(80) }) }), quote_token: z.object({ data: z.object({ id: z.string().max(80) }) }) }),
})).max(100) });
const ohlcvSchema = z.object({ data: z.object({ attributes: z.object({ ohlcv_list: z.array(z.array(z.number()).min(5).max(6)).max(1_000) }) }) });

/** The deepest pool that actually contains the mint, above the value floor. */
export function choosePool(payload: unknown, mint: string): { address: string; name: string } | null {
  const parsed = poolsSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError('unavailable', 'Chart pools could not be read.');
  const id = `solana_${mint}`;
  let best: { address: string; name: string; reserve: number } | null = null;
  for (const pool of parsed.data.data) {
    if (pool.relationships.base_token.data.id !== id && pool.relationships.quote_token.data.id !== id) continue;
    const reserve = Number(pool.attributes.reserve_in_usd ?? 'NaN');
    if (!Number.isFinite(reserve) || reserve < MIN_CHART_POOL_USD || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool.attributes.address)) continue;
    if (!best || reserve > best.reserve) best = { address: pool.attributes.address, name: pool.attributes.name, reserve };
  }
  return best ? { address: best.address, name: best.name } : null;
}

/** Closing prices, oldest first, inside the requested window; malformed candles are dropped. */
export function normalizeCandles(payload: unknown, range: ChartRange, now: number): ChartPoint[] {
  const parsed = ohlcvSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError('unavailable', 'Chart prices could not be read.');
  const earliest = now - RANGES[range].spanMs * 1.5;
  const seen = new Set<number>();
  const points: ChartPoint[] = [];
  for (const candle of parsed.data.data.attributes.ohlcv_list) {
    const t = candle[0] * 1000;
    const c = candle[4];
    if (!Number.isSafeInteger(t) || !Number.isFinite(c) || c <= 0 || t < earliest || t > now + 3_600_000 || seen.has(t)) continue;
    seen.add(t);
    points.push({ t, c });
  }
  return points.sort((a, b) => a.t - b.t);
}

type Dependencies = { fetch: typeof fetchJson; now: () => number; run: <T>(operation: () => Promise<T>) => Promise<T> };
const defaults: Dependencies = { fetch: fetchJson, now: Date.now, run: operation => queue.run(operation) };
const headers = { Accept: 'application/json' };

/** Mints are checked against Lotline's catalogs by the caller; no other address reaches GeckoTerminal. */
export async function readChart(mint: string, range: ChartRange, deps: Dependencies = defaults): Promise<ChartResponse> {
  const key = `${mint}:${range}`;
  const cached = chartCache.get(key);
  if (cached) return cached;
  const fetchedAt = new Date(deps.now()).toISOString();
  const unavailable = (message: string): ChartResponse => ({ state: 'unavailable', mint, range, points: [], source: 'GeckoTerminal', pool: null, fetchedAt, message });
  try {
    let pool = poolCache.get(mint);
    if (pool === undefined) {
      pool = choosePool(await deps.run(() => deps.fetch(`${API}/networks/solana/tokens/${mint}/pools?page=1`, { headers })), mint);
      poolCache.set(mint, pool, POOL_TTL_MS);
    }
    if (!pool) return unavailable('No pool with enough liquidity reports a price history for this asset.');
    const { timeframe, aggregate, limit } = RANGES[range];
    const points = normalizeCandles(await deps.run(() => deps.fetch(`${API}/networks/solana/pools/${pool.address}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=${mint}`, { headers })), range, deps.now());
    if (points.length < 2) return unavailable('Not enough recent trades to draw this range.');
    const result: ChartResponse = { state: 'success', mint, range, points, source: 'GeckoTerminal', pool, fetchedAt };
    chartCache.set(key, result, CHART_TTL_MS);
    return result;
  } catch (error) {
    return unavailable(error instanceof ServiceError && error.reasonCode === 'rate-limited' ? 'The chart source is busy. Try again in a minute.' : 'The price history is temporarily unavailable.');
  }
}
