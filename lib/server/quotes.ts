import 'server-only';
import { z } from 'zod';
import type { Asset, Quote, QuotesResponse } from '../domain/types';
import { getIssuerAsset, selectedAssets } from './catalog';
import { addressSchema, BoundedCache, fetchJson, rawSchema, safeMessage, ServiceError, SpacedQueue, USDC_MINT } from './common';
import { convertRawUnits } from './solana';
import { reserveProviderSlot } from './provider-limits';

// 2.1 seconds => fewer than 30 starts in every sliding 60-second window.
// Deliberately retains this conservative limit with an optional API key.
const quoteQueue = new SpacedQueue(2100, 6);
const quoteCache = new BoundedCache<Quote>(60);
const pending = new Map<string, Promise<Quote>>();
const upstreamSchema = z.object({
  inputMint: addressSchema, outputMint: addressSchema, inAmount: rawSchema, outAmount: rawSchema,
  router: z.enum(['metis', 'jupiterz', 'dflow', 'okx']).optional(),
  feeBps: z.number().int().min(0).max(10_000).optional(), feeMint: addressSchema.optional(),
  expireAt: z.string().datetime({ offset: true }).optional(),
  transaction: z.union([z.literal(null), z.literal('')]).optional(),
  errorCode: z.number().optional(), errorMessage: z.string().optional(),
});
export function normalizeQuote(payload: unknown, mint: string, usdcRaw: string, fetchedAt = new Date().toISOString()): Quote {
  const parsed = upstreamSchema.safeParse(payload);
  if (!parsed.success || parsed.data.inputMint !== USDC_MINT || parsed.data.outputMint !== mint || parsed.data.inAmount !== usdcRaw || BigInt(parsed.data.outAmount) <= 0n) throw new ServiceError('unavailable', 'No verified quote is available for this amount. Try a different amount or refresh.');
  const data = parsed.data;
  if (data.errorCode !== undefined || data.errorMessage) throw new ServiceError('unavailable', 'Jupiter could not provide a usable route. Try again later.');
  const expiry = Math.min(Date.parse(fetchedAt) + 30_000, data.expireAt ? Date.parse(data.expireAt) : Infinity);
  if (expiry <= Date.now()) throw new ServiceError('unavailable', 'The provider quote already expired. Refresh estimates.');
  return { mint, state: 'success', usdcRaw, outRaw: data.outAmount, units: null, fetchedAt, expiresAt: new Date(expiry).toISOString(), ...(data.router ? { source: `Jupiter · ${data.router}` } : { source: 'Jupiter' }), ...(data.feeBps !== undefined ? { feeBps: data.feeBps } : {}), ...(data.feeMint ? { feeMint: data.feeMint } : {}) };
}
export function unavailableQuote(mint: string, usdcRaw: string, message: string): Quote {
  const timestamp = new Date().toISOString();
  return { mint, usdcRaw, state: 'unavailable', outRaw: null, units: null, fetchedAt: timestamp, expiresAt: timestamp, message };
}
async function freshQuote(asset: Asset, usdcRaw: string): Promise<Quote> {
  return quoteQueue.run(async () => {
    // Recheck the issuer immediately before fetching; a halt never becomes a DEX market-hours claim.
    const issuer = await getIssuerAsset(asset.symbol);
    if (issuer.mint !== asset.mint) throw new ServiceError('unavailable', 'The issuer deployment changed. Reload the catalog.');
    if (issuer.halted) throw new ServiceError('unavailable', 'The issuer reports a trading halt. Fresh estimates are paused for this asset.');
    const params = new URLSearchParams({ inputMint: USDC_MINT, outputMint: asset.mint, amount: usdcRaw });
    const apiKey = process.env.JUPITER_API_KEY?.trim();
    // Only these three parameters are sent. No wallet/taker, transaction, or execute call exists.
    await reserveProviderSlot('jupiter');
    const payload = await fetchJson(`https://api.jup.ag/swap/v2/order?${params}`, { headers: apiKey ? { 'x-api-key': apiKey } : {} });
    const quote = normalizeQuote(payload, asset.mint, usdcRaw);
    try { quote.units = await convertRawUnits(asset.mint, quote.outRaw!); }
    catch (error) { quote.message = safeMessage(error); }
    return quote;
  });
}
async function getQuote(asset: Asset, usdcRaw: string): Promise<Quote> {
  const key = `${asset.mint}:${usdcRaw}`;
  const cached = quoteCache.get(key);
  if (cached && Date.parse(cached.expiresAt) > Date.now()) return cached; // preserves original fetchedAt
  let promise = pending.get(key);
  if (!promise) {
    promise = freshQuote(asset, usdcRaw).then(quote => {
      quoteCache.set(key, quote, Math.max(0, Math.min(5000, Date.parse(quote.expiresAt) - Date.now())));
      return quote;
    }).catch(error => unavailableQuote(asset.mint, usdcRaw, safeMessage(error))).finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}
export async function getQuotes(items: { mint: string; usdcRaw: string }[]): Promise<QuotesResponse> {
  const active = items.filter(item => BigInt(item.usdcRaw) > 0n);
  const assets = await selectedAssets(items.map(item => item.mint));
  const quotes = await Promise.all(active.map(item => getQuote(assets.find(asset => asset.mint === item.mint)!, item.usdcRaw)));
  const complete = quotes.filter(item => item.state === 'success' && item.units !== null).length;
  return { state: complete === quotes.length ? 'success' : quotes.some(item => item.state === 'success') ? 'partial' : 'unavailable', quotes };
}
