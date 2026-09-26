import * as z from 'zod/mini';
import { DBC_FRESHNESS_MS, DBC_MAX_ITEMS, DBC_SOURCE_LABEL, dbcResponseSchema, type DbcItem, type DbcResponse } from '../domain/dbc';

/**
 * Reads the Meteora DBC panel data in bounded batches, exactly like the quote
 * batches: every response is validated against the shared DTO schema, must answer
 * only the mints that were asked for, and a failed batch degrades to a labelled
 * per-asset statement rather than discarding the other batches.
 */
export const dbcRequestItemsSchema = z.array(z.strictObject({
  mint: z.string().check(z.regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)),
  quoteRaw: z.optional(z.string().check(z.maxLength(20), z.regex(/^(0|[1-9][0-9]*)$/))),
})).check(z.minLength(1), z.maxLength(DBC_MAX_ITEMS));
export type DbcRequestItem = z.infer<typeof dbcRequestItemsSchema>[number];

function statement(mint: string, message: string): DbcItem {
  const fetchedAt = new Date().toISOString();
  return {
    mint, state: 'unavailable', quoteToken: false, badgeAccount: mint, configCount: 0, configsProbed: 0, pools: [],
    source: DBC_SOURCE_LABEL, slot: 0, fetchedAt, expiresAt: new Date(Date.parse(fetchedAt) + DBC_FRESHNESS_MS).toISOString(),
    reasonCode: 'provider-unavailable', message,
  };
}
function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The Meteora DBC read could not be reached. Your Jupiter estimates remain available.';
}

async function readBatch(response: Response, batch: DbcRequestItem[]): Promise<DbcResponse> {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The Meteora DBC read returned an unreadable response.');
  const parsed = dbcResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The Meteora DBC read returned an unverified response.');
  const data = parsed.data;
  if (data.items.some(item => !batch.some(request => request.mint === item.mint))) throw new Error('The Meteora DBC read answered a different asset.');
  if (!response.ok && data.items.some(item => item.pools.length)) throw new Error('The Meteora DBC read returned an unverified response.');
  return data;
}

export async function requestDbcPairs(items: DbcRequestItem[], signal: AbortSignal): Promise<DbcItem[]> {
  const results: DbcItem[] = [];
  for (let offset = 0; offset < items.length; offset += DBC_MAX_ITEMS) {
    signal.throwIfAborted();
    const batch = items.slice(offset, offset + DBC_MAX_ITEMS);
    if (!dbcRequestItemsSchema.safeParse(batch).success) {
      results.push(...batch.map(request => statement(request.mint, 'This selection is outside the Meteora DBC read request shape.')));
      continue;
    }
    try {
      const response = await fetch('/api/dbc/quotes', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: batch }), cache: 'no-store', signal,
      });
      const data = await readBatch(response, batch);
      signal.throwIfAborted();
      results.push(...batch.map(request => data.items.find(item => item.mint === request.mint)
        ?? statement(request.mint, data.message ?? 'No Meteora DBC read was returned for this asset.')));
    } catch (error) {
      signal.throwIfAborted();
      results.push(...batch.map(request => statement(request.mint, message(error))));
    }
  }
  return results;
}
