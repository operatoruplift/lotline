import { z } from 'zod';
import type { DataFailureReason, Holding, HoldingsResponse, ProjectionResponse, Quote, QuotesResponse } from '../domain/types';

// Zod compiles validators with `new Function` and probes for it with a bare
// `Function("")`. Our script-src withholds 'unsafe-eval', so in the browser that
// probe is refused, Zod falls back to interpreted validation, and Chrome records a
// CSP violation for a capability we never intended to use. Declaring jitless up
// front reaches the same interpreted path without the refused call. The server has
// no such policy, so it keeps the compiled path.
if (typeof window !== 'undefined') z.config({ jitless: true });
import { API_BATCH_SIZE } from '../domain/limits';
import { USDC_MINT } from '../demo/example';
import type { PlannerApiPrefix } from '../domain/planner-universe';

async function read<T>(response: Response): Promise<T> {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The service returned an unreadable response. Please retry.');
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'The service is temporarily unavailable. Please retry.');
  return data as T;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The service is temporarily unavailable. Please retry.';
}

function quoteResult(quotes: Quote[]): QuotesResponse {
  const complete = quotes.filter(quote => quote.state === 'success' && quote.units !== null).length;
  return { state: complete === quotes.length ? 'success' : quotes.some(quote => quote.state === 'success') ? 'partial' : 'unavailable', quotes: [...quotes] };
}

const isRawAmount = (value: string) => value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n;
const rawAmount = z.string().refine(isRawAmount);
const slot = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quoteSchema = z.object({
  mint: z.string().min(32).max(44), usdcRaw: rawAmount, state: z.enum(['success', 'unavailable']),
  outRaw: rawAmount.nullable(), units: z.string().max(100).regex(/^\d+(\.\d+)?$/).nullable(),
  fetchedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  source: z.string().max(100).optional(), feeBps: z.number().int().min(0).max(10_000).optional(), feeMint: z.string().max(44).optional(),
  message: z.string().max(500).optional(), reasonCode: z.enum(['no-route', 'issuer-halted', 'unsupported-token', 'rate-limited', 'stale-verification', 'provider-unavailable']).optional(),
  unitContext: z.object({ source: z.enum(['clock-sysvar', 'mint']), kind: z.enum(['scaled', 'standard']), decimals: z.number().int().min(0).max(18), tokenProgram: z.string().max(44), mintSlot: slot, observedAt: z.string().datetime({ offset: true }), clockSlot: slot.optional(), unixTimestamp: rawAmount.optional(), multiplier: z.number().positive().finite().optional() }).optional(),
}).refine(quote => quote.state === 'unavailable' ? quote.outRaw === null && quote.units === null : quote.outRaw !== null && isRawAmount(quote.outRaw) && BigInt(quote.outRaw) > 0n);
const quotesResponseSchema = z.object({ state: z.enum(['success', 'partial', 'unavailable', 'invalid-input', 'configuration-required']), quotes: z.array(quoteSchema).max(API_BATCH_SIZE), message: z.string().max(500).optional() });
class QuoteResponseError extends Error {
  constructor(message: string, readonly reasonCode: DataFailureReason) { super(message); }
}

/** A valid 503 failure DTO contains useful per-asset errors, never successful estimates. */
async function readQuotes(response: Response, batch: { mint: string; usdcRaw: string }[]): Promise<QuotesResponse> {
  const fallback: DataFailureReason = response.status === 429 ? 'rate-limited' : 'provider-unavailable';
  if (!response.headers.get('content-type')?.includes('application/json')) throw new QuoteResponseError(response.status === 429 ? 'The service rate limit was reached. Wait a moment, then retry.' : 'The service returned an unreadable response. Please retry.', fallback);
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new QuoteResponseError('The service returned unreadable estimate data. Please retry.', fallback); }
  const parsed = quotesResponseSchema.safeParse(body);
  if (!parsed.success || new Set(parsed.data.quotes.map(quote => quote.mint)).size !== parsed.data.quotes.length
    || parsed.data.quotes.some(quote => !batch.some(item => item.mint === quote.mint && item.usdcRaw === quote.usdcRaw))
    || (!response.ok && parsed.data.quotes.some(quote => quote.state === 'success'))) throw new QuoteResponseError('The service returned an unverified estimate response. Please retry.', fallback);
  if (response.status === 429 && !parsed.data.quotes.length) throw new QuoteResponseError(parsed.data.message ?? 'The service rate limit was reached. Wait a moment, then retry.', 'rate-limited');
  return { ...parsed.data, quotes: parsed.data.quotes.map(quote => quote.state === 'unavailable' ? { ...quote, reasonCode: quote.reasonCode ?? fallback } : quote) };
}

/** Keep requests small and publish each completed batch with original timestamps. */
export async function requestQuotes(items: { mint: string; usdcRaw: string }[], signal: AbortSignal, progress: (result: QuotesResponse, done: number) => void, apiPrefix: PlannerApiPrefix = '/api'): Promise<QuotesResponse> {
  const quotes: Quote[] = [];
  for (let offset = 0; offset < items.length; offset += API_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = items.slice(offset, offset + API_BATCH_SIZE);
    try {
      const response = await readQuotes(await fetch(`${apiPrefix}/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: batch }), signal }), batch);
      signal.throwIfAborted();
      const timestamp = new Date().toISOString();
      quotes.push(...batch.map(({ mint, usdcRaw }): Quote => response.quotes.find(quote => quote.mint === mint && quote.usdcRaw === usdcRaw) ?? { mint, usdcRaw, state: 'unavailable', outRaw: null, units: null, fetchedAt: timestamp, expiresAt: timestamp, message: response.message ?? 'No estimate was returned for this asset.', reasonCode: 'provider-unavailable' }));
    } catch (error) {
      signal.throwIfAborted();
      const timestamp = new Date().toISOString();
      quotes.push(...batch.map(({ mint, usdcRaw }): Quote => ({ mint, usdcRaw, state: 'unavailable', outRaw: null, units: null, fetchedAt: timestamp, expiresAt: timestamp, message: message(error), reasonCode: error instanceof QuoteResponseError ? error.reasonCode : 'provider-unavailable' })));
    }
    progress(quoteResult(quotes), Math.min(offset + batch.length, items.length));
  }
  return quoteResult(quotes);
}

export async function requestHoldings(owner: string, mints: string[], signal: AbortSignal, apiPrefix: PlannerApiPrefix = '/api'): Promise<HoldingsResponse> {
  const missing = (mint: string, error: unknown): Holding => ({ mint, state: 'unavailable', raw: null, units: null, message: message(error) });
  const holdings: Holding[] = [];
  let usdc = missing(USDC_MINT, new Error('USDC balance could not be verified.'));
  let fetchedAt: string | null = null;
  for (let offset = 0; offset < mints.length; offset += API_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = mints.slice(offset, offset + API_BATCH_SIZE);
    try {
      const params = new URLSearchParams({ owner, mints: batch.join(',') });
      const response = await read<HoldingsResponse>(await fetch(`${apiPrefix}/holdings?${params}`, { signal }));
      signal.throwIfAborted();
      holdings.push(...batch.map(mint => response.holdings.find(holding => holding.mint === mint) ?? missing(mint, new Error(response.message ?? 'No balance was returned for this asset.'))));
      if (usdc.state !== 'success' || usdc.units === null) usdc = response.usdc;
      // The combined snapshot is at least as old as its oldest provider result.
      if (fetchedAt === null || Date.parse(response.fetchedAt) < Date.parse(fetchedAt)) fetchedAt = response.fetchedAt;
    } catch (error) {
      signal.throwIfAborted();
      holdings.push(...batch.map(mint => missing(mint, error)));
    }
  }
  const all = [...holdings, usdc];
  const complete = all.filter(holding => holding.state === 'success' && holding.units !== null).length;
  return { state: complete === all.length ? 'success' : all.some(holding => holding.state === 'success') ? 'partial' : 'unavailable', holdings, usdc, fetchedAt: fetchedAt ?? new Date().toISOString() };
}

export async function requestUnits(items: { mint: string; raw: string }[], signal: AbortSignal, apiPrefix: PlannerApiPrefix = '/api'): Promise<ProjectionResponse> {
  const results: ProjectionResponse['items'] = [];
  for (let offset = 0; offset < items.length; offset += API_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = items.slice(offset, offset + API_BATCH_SIZE);
    try {
      const response = await read<ProjectionResponse>(await fetch(`${apiPrefix}/units`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: batch }), signal }));
      signal.throwIfAborted();
      results.push(...batch.map(({ mint }) => response.items.find(item => item.mint === mint) ?? { mint, units: null, message: 'Resulting units could not be verified.' }));
    } catch (error) {
      signal.throwIfAborted();
      results.push(...batch.map(({ mint }) => ({ mint, units: null, message: message(error) })));
    }
  }
  const complete = results.filter(item => item.units !== null).length;
  return { state: complete === items.length ? 'success' : complete ? 'partial' : 'unavailable', items: results };
}
