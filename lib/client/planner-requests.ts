import type { Holding, HoldingsResponse, ProjectionResponse, Quote, QuotesResponse } from '../domain/types';
import { API_BATCH_SIZE } from '../domain/limits';
import { USDC_MINT } from '../demo/example';

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

/** Keep requests small and publish each completed batch with original timestamps. */
export async function requestQuotes(items: { mint: string; usdcRaw: string }[], signal: AbortSignal, progress: (result: QuotesResponse, done: number) => void): Promise<QuotesResponse> {
  const quotes: Quote[] = [];
  for (let offset = 0; offset < items.length; offset += API_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = items.slice(offset, offset + API_BATCH_SIZE);
    try {
      const response = await read<QuotesResponse>(await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: batch }), signal }));
      signal.throwIfAborted();
      const timestamp = new Date().toISOString();
      quotes.push(...batch.map(({ mint, usdcRaw }): Quote => response.quotes.find(quote => quote.mint === mint && quote.usdcRaw === usdcRaw) ?? { mint, usdcRaw, state: 'unavailable', outRaw: null, units: null, fetchedAt: timestamp, expiresAt: timestamp, message: response.message ?? 'No estimate was returned for this asset.' }));
    } catch (error) {
      signal.throwIfAborted();
      const timestamp = new Date().toISOString();
      quotes.push(...batch.map(({ mint, usdcRaw }): Quote => ({ mint, usdcRaw, state: 'unavailable', outRaw: null, units: null, fetchedAt: timestamp, expiresAt: timestamp, message: message(error) })));
    }
    progress(quoteResult(quotes), Math.min(offset + batch.length, items.length));
  }
  return quoteResult(quotes);
}

export async function requestHoldings(owner: string, mints: string[], signal: AbortSignal): Promise<HoldingsResponse> {
  const missing = (mint: string, error: unknown): Holding => ({ mint, state: 'unavailable', raw: null, units: null, message: message(error) });
  const holdings: Holding[] = [];
  let usdc = missing(USDC_MINT, new Error('USDC balance could not be verified.'));
  let fetchedAt: string | null = null;
  for (let offset = 0; offset < mints.length; offset += API_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = mints.slice(offset, offset + API_BATCH_SIZE);
    try {
      const params = new URLSearchParams({ owner, mints: batch.join(',') });
      const response = await read<HoldingsResponse>(await fetch(`/api/holdings?${params}`, { signal }));
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

export async function requestUnits(items: { mint: string; raw: string }[], signal: AbortSignal): Promise<ProjectionResponse> {
  const results: ProjectionResponse['items'] = [];
  for (let offset = 0; offset < items.length; offset += API_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = items.slice(offset, offset + API_BATCH_SIZE);
    try {
      const response = await read<ProjectionResponse>(await fetch('/api/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: batch }), signal }));
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
