import 'server-only';
import { z } from 'zod';
import { CRYPTO_MINTS } from '../domain/crypto-assets';
import { MARKET_MINTS, MARKET_SNAPSHOT_SOURCE, type MarketSnapshot, type MarketStats } from '../domain/markets';
import { cryptoEnabled } from './features';
import { fetchJson, ServiceError } from './common';
import { reserveProviderSlot } from './provider-limits';

/** Jupiter's token search accepts up to 100 comma-separated mints per request. */
export const SNAPSHOT_BATCH = 100;
/** A snapshot is served as current for ten minutes. */
export const SNAPSHOT_FRESH_MS = 10 * 60_000;
/** Past an hour it is never served; the next reader waits for a new one. */
export const SNAPSHOT_MAX_AGE_MS = 60 * 60_000;

const finite = z.number().finite();
const nonNegative = finite.min(0);
const optionalNumber = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();
const tokenSchema = z.object({
  id: z.string().max(64),
  usdPrice: optionalNumber(nonNegative),
  liquidity: optionalNumber(nonNegative),
  mcap: optionalNumber(nonNegative),
  holderCount: optionalNumber(z.number().int().min(0)),
  updatedAt: optionalNumber(z.string().max(40)),
  stats24h: z.object({
    priceChange: optionalNumber(finite),
    buyVolume: optionalNumber(nonNegative),
    sellVolume: optionalNumber(nonNegative),
  }).nullable().optional(),
});

const isoOrNull = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

/**
 * Keeps only records for the mints that were asked for, the first record per
 * mint, and fields that validate. Anything else in the upstream record is ignored.
 */
export function normalizeTokens(payload: unknown, requested: readonly string[]): Record<string, MarketStats> {
  if (!Array.isArray(payload) || payload.length > SNAPSHOT_BATCH * 2) throw new ServiceError('unavailable', 'The market snapshot source returned an unexpected response.');
  const wanted = new Set(requested);
  const entries = new Map<string, MarketStats>();
  for (const item of payload) {
    const parsed = tokenSchema.safeParse(item);
    if (!parsed.success || !wanted.has(parsed.data.id) || entries.has(parsed.data.id)) continue;
    const token = parsed.data;
    const day = token.stats24h ?? {};
    const buy = day.buyVolume ?? null;
    const sell = day.sellVolume ?? null;
    entries.set(token.id, {
      price: token.usdPrice ?? null,
      change24hPct: day.priceChange ?? null,
      volume24hUsd: buy === null && sell === null ? null : (buy ?? 0) + (sell ?? 0),
      liquidityUsd: token.liquidity ?? null,
      marketCapUsd: token.mcap ?? null,
      holders: token.holderCount ?? null,
      updatedAt: isoOrNull(token.updatedAt),
    });
  }
  return Object.fromEntries(entries);
}

type Dependencies = { fetch: typeof fetchJson; reserve: typeof reserveProviderSlot; now: () => number };
const defaults: Dependencies = { fetch: fetchJson, reserve: reserveProviderSlot, now: Date.now };

/** One pass over every catalog mint, in batches that share Jupiter's provider budget. */
export async function buildMarketSnapshot(mints: readonly string[] = MARKET_MINTS, deps: Dependencies = defaults): Promise<MarketSnapshot> {
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  const batches = Array.from({ length: Math.ceil(mints.length / SNAPSHOT_BATCH) }, (_, index) => mints.slice(index * SNAPSHOT_BATCH, (index + 1) * SNAPSHOT_BATCH));
  const results: Record<string, MarketStats>[] = [];
  let failed = 0;
  for (const batch of batches) {
    try {
      await deps.reserve('jupiter');
      results.push(normalizeTokens(await deps.fetch(`https://api.jup.ag/tokens/v2/search?query=${batch.join(',')}`, { headers: apiKey ? { 'x-api-key': apiKey } : {} }), batch));
    } catch { failed += 1; }
  }
  const stats: Record<string, MarketStats> = Object.assign({}, ...results);
  const covered = Object.keys(stats).length;
  if (!covered) throw new ServiceError('unavailable', 'Market data is temporarily unavailable. Asset names and adding to a plan still work.', 'provider-unavailable');
  return {
    state: covered === mints.length ? 'success' : 'partial', source: MARKET_SNAPSHOT_SOURCE, fetchedAt: new Date(deps.now()).toISOString(),
    stats, missing: mints.length - covered,
    ...(failed ? { message: `${failed} of ${batches.length} snapshot requests failed; affected assets show no market figures.` } : {}),
  };
}

export interface MarketStore {
  /** A fresh snapshot, a stale one plus the refresh to run after responding, or a new read. */
  read(): Promise<{ snapshot: MarketSnapshot; refresh: (() => Promise<MarketSnapshot>) | null }>;
}

/** Process-local cache with one in-flight read; failures are never cached. */
export function createMarketStore(build: () => Promise<MarketSnapshot> = () => buildMarketSnapshot(), now: () => number = Date.now): MarketStore {
  let current: { snapshot: MarketSnapshot; at: number } | null = null;
  let inflight: Promise<MarketSnapshot> | null = null;
  const refresh = (): Promise<MarketSnapshot> => {
    inflight ??= build().then(snapshot => { current = { snapshot, at: now() }; return snapshot; }).finally(() => { inflight = null; });
    return inflight;
  };
  return {
    async read() {
      const age = current ? now() - current.at : Infinity;
      if (current && age < SNAPSHOT_FRESH_MS) return { snapshot: current.snapshot, refresh: null };
      if (current && age < SNAPSHOT_MAX_AGE_MS) return { snapshot: { ...current.snapshot, stale: true }, refresh };
      return { snapshot: await refresh(), refresh: null };
    },
  };
}

// The mints are chosen at each read, so the crypto flag never needs a new store.
export const marketStore = createMarketStore(() => buildMarketSnapshot(cryptoEnabled() ? [...MARKET_MINTS, ...CRYPTO_MINTS] : MARKET_MINTS));
