import 'server-only';
import { unwrapOption } from '@solana/kit';
import { z } from 'zod';
import type { ChartPoint, ChartRange, ChartResponse } from '../domain/markets';
import { BoundedCache, fetchJson, ServiceError, SpacedQueue } from './common';
import { loadMintSnapshot } from './solana';

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
  attributes: z.object({ address: z.string().max(64), name: z.string().max(120), reserve_in_usd: z.string().max(40).nullable().optional(), volume_usd: z.object({ h24: z.string().max(40).nullable().optional() }).nullable().optional() }),
  relationships: z.object({ base_token: z.object({ data: z.object({ id: z.string().max(80) }) }), quote_token: z.object({ data: z.object({ id: z.string().max(80) }) }) }),
})).max(100) });
const ohlcvSchema = z.object({ data: z.object({ attributes: z.object({ ohlcv_list: z.array(z.array(z.number()).min(5).max(6)).max(1_000) }) }) });

/** Pools priced directly against a dollar stablecoin or SOL; other pairs price the asset through a second token. */
const REFERENCE_TOKENS = new Set([
  'solana_EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'solana_Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'solana_So11111111111111111111111111111111111111112',
]);

/** A reference pool this busy relative to the busiest pool is preferred; a quieter one trades too rarely to chart. */
export const REFERENCE_SHARE = 0.2;

type Candidate = { address: string; name: string; reserve: number; volume: number };

/** More trading in the last day ranks higher; between pools that traded equally (usually not at all), the deeper one. */
function outranks(candidate: Candidate, current: Candidate | null): boolean {
  return !current || candidate.volume > current.volume || (candidate.volume === current.volume && candidate.reserve > current.reserve);
}

/**
 * The busiest pool that contains the mint and clears the value floor. Locked
 * value alone misleads: a pool against a thinly traded token can report
 * hundreds of millions locked yet trade too rarely to chart. A pool priced
 * directly against a reference token wins when it does at least a fifth of
 * the busiest pool's trading, since its price needs no second conversion.
 * When no pool reports trading, the same rule runs on locked value.
 */
export function choosePool(payload: unknown, mint: string): { address: string; name: string } | null {
  const parsed = poolsSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError('unavailable', 'Chart pools could not be read.');
  const id = `solana_${mint}`;
  let busiest: Candidate | null = null;
  let reference: Candidate | null = null;
  for (const pool of parsed.data.data) {
    const { base_token: base, quote_token: quote } = pool.relationships;
    if (base.data.id !== id && quote.data.id !== id) continue;
    const reserve = Number(pool.attributes.reserve_in_usd ?? 'NaN');
    if (!Number.isFinite(reserve) || reserve < MIN_CHART_POOL_USD || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool.attributes.address)) continue;
    const traded = Number(pool.attributes.volume_usd?.h24 ?? 'NaN');
    const candidate = { address: pool.attributes.address, name: pool.attributes.name, reserve, volume: Number.isFinite(traded) && traded > 0 ? traded : 0 };
    if (outranks(candidate, busiest)) busiest = candidate;
    if (REFERENCE_TOKENS.has(base.data.id === id ? quote.data.id : base.data.id) && outranks(candidate, reference)) reference = candidate;
  }
  if (!busiest) return null;
  const share = !reference ? 0 : busiest.volume > 0 ? reference.volume / busiest.volume : reference.reserve / busiest.reserve;
  const best = reference && share >= REFERENCE_SHARE ? reference : busiest;
  return { address: best.address, name: best.name };
}

/**
 * Token-2022 scaled UI amounts: a displayed unit is a raw unit times the
 * multiplier, which switches to the new multiplier at its effective time.
 */
export type DisplayScale = { multiplier: number; newMultiplier: number; effectiveAtMs: number };

/**
 * GeckoTerminal prices raw token units; Lotline's market figures and planner
 * show displayed units. Each close is divided by the multiplier in force at
 * that time, so a split or dividend adjustment does not misstate the chart.
 */
export function toDisplayPrices(points: readonly ChartPoint[], scale: DisplayScale | null): ChartPoint[] {
  if (!scale) return [...points];
  return points.map(point => ({ t: point.t, c: point.c / (point.t >= scale.effectiveAtMs ? scale.newMultiplier : scale.multiplier) }));
}

async function readDisplayScale(mint: string): Promise<DisplayScale | null> {
  const { mint: decoded } = await loadMintSnapshot(mint, false);
  const config = (unwrapOption(decoded.extensions) ?? []).find(extension => extension.__kind === 'ScaledUiAmountConfig');
  if (!config) return null;
  if (!(config.multiplier > 0) || !(config.newMultiplier > 0)) throw new ServiceError('unavailable', 'Display scaling is invalid.');
  return { multiplier: config.multiplier, newMultiplier: config.newMultiplier, effectiveAtMs: Number(config.newMultiplierEffectiveTimestamp) * 1000 };
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

type Dependencies = { fetch: typeof fetchJson; now: () => number; run: <T>(operation: () => Promise<T>) => Promise<T>; scale: (mint: string) => Promise<DisplayScale | null> };
const defaults: Dependencies = { fetch: fetchJson, now: Date.now, run: operation => queue.run(operation), scale: readDisplayScale };
const headers = { Accept: 'application/json' };

/** Mints are checked against Lotline's catalogs by the caller; no other address reaches GeckoTerminal. */
export async function readChart(mint: string, range: ChartRange, deps: Dependencies = defaults): Promise<ChartResponse> {
  const key = `${mint}:${range}`;
  const cached = chartCache.get(key);
  if (cached) return cached;
  const fetchedAt = new Date(deps.now()).toISOString();
  const unavailable = (message: string, retryable = false): ChartResponse => ({ state: 'unavailable', mint, range, points: [], source: 'GeckoTerminal', pool: null, fetchedAt, message, ...(retryable ? { retryable } : {}) });
  try {
    let pool = poolCache.get(mint);
    if (pool === undefined) {
      pool = choosePool(await deps.run(() => deps.fetch(`${API}/networks/solana/tokens/${mint}/pools?page=1`, { headers })), mint);
      poolCache.set(mint, pool, POOL_TTL_MS);
    }
    if (!pool) return unavailable('No pool with enough liquidity reports a price history for this asset.');
    let scale: DisplayScale | null;
    try { scale = await deps.scale(mint); }
    // Usually a failed RPC read, so asking again can work.
    catch { return unavailable('This asset’s display units could not be verified, so no price history is shown.', true); }
    const { timeframe, aggregate, limit } = RANGES[range];
    const raw = normalizeCandles(await deps.run(() => deps.fetch(`${API}/networks/solana/pools/${pool.address}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=${mint}`, { headers })), range, deps.now());
    if (raw.length < 2) return unavailable('Not enough recent trades to draw this range.');
    const points = toDisplayPrices(raw, scale);
    const result: ChartResponse = { state: 'success', mint, range, points, source: 'GeckoTerminal', pool, fetchedAt };
    chartCache.set(key, result, CHART_TTL_MS);
    return result;
  } catch (error) {
    return unavailable(error instanceof ServiceError && error.reasonCode === 'rate-limited' ? 'The chart source is busy. Try again in a minute.' : 'The price history is temporarily unavailable.', true);
  }
}
