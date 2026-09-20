import 'server-only';
import { unwrapOption } from '@solana/kit';
import { z } from 'zod';
import { PRESTOCK_ISSUER_URL, PRESTOCK_REGISTRY, preStockIdentityForSymbol, type PreStockIdentity } from '../domain/prestocks';
import type { Asset, CatalogResponse, Quote, QuotesResponse } from '../domain/types';
import { addressSchema, BoundedCache, fetchJson, safeMessage, ServiceError, TOKEN_2022_PROGRAM } from './common';
import { getHoldingsForVerifiedAssets, getUnitsForVerifiedAssets } from './holdings';
import { getReadOnlyQuote, unavailableQuote } from './quotes';
import { loadMints, loadMintSnapshot, rpcConfigured } from './solana';

const rowSchema = z.object({
  name: z.string().min(1).max(120), symbol: z.string().min(1).max(16),
  contract_address: addressSchema, image: z.string().max(300), external_url: z.string().max(300),
});
type IssuerObservation = { identity: Readonly<PreStockIdentity>; fetchedAt: string };
const issuerCache = new BoundedCache<Map<string, IssuerObservation | ServiceError>>(1);
const catalogCache = new BoundedCache<CatalogResponse>(1);
const quoteCache = new BoundedCache<Quote>(60);
const pendingQuotes = new Map<string, Promise<Quote>>();
let pendingIssuer: Promise<Map<string, IssuerObservation | ServiceError>> | undefined;
let pendingCatalog: Promise<CatalogResponse> | undefined;

/** The API has no halt flag or provider price timestamp. Neither is inferred from prices. */
export function parsePreStocksIssuerCatalog(payload: unknown, fetchedAt = new Date().toISOString()): Map<string, IssuerObservation | ServiceError> {
  const list = z.array(z.unknown()).max(100).safeParse(payload);
  if (!list.success) throw new ServiceError('unavailable', 'The PreStocks issuer catalog could not be verified.');
  const output = new Map<string, IssuerObservation | ServiceError>();
  const mintCounts = new Map<string, number>();
  for (const row of list.data) {
    const key = z.object({ contract_address: z.string() }).safeParse(row);
    if (key.success) mintCounts.set(key.data.contract_address, (mintCounts.get(key.data.contract_address) ?? 0) + 1);
  }
  for (const row of list.data) {
    const key = z.object({ symbol: z.string() }).safeParse(row);
    if (!key.success) continue;
    const identity = preStockIdentityForSymbol(key.data.symbol);
    if (!identity) continue;
    const parsed = rowSchema.safeParse(row);
    if (output.has(identity.symbol) || mintCounts.get(identity.mint) !== 1) {
      output.set(identity.symbol, new ServiceError('unavailable', 'The PreStocks issuer returned an ambiguous identity.'));
    } else if (!parsed.success || parsed.data.name !== identity.name || parsed.data.contract_address !== identity.mint || parsed.data.image !== identity.logoSourceUrl || parsed.data.external_url !== identity.productUrl) {
      output.set(identity.symbol, new ServiceError('unavailable', 'The PreStocks issuer identity changed and requires catalog review.'));
    } else output.set(identity.symbol, { identity, fetchedAt });
  }
  return output;
}

async function getIssuerCatalog(): Promise<Map<string, IssuerObservation | ServiceError>> {
  const cached = issuerCache.get('issuer');
  if (cached) return cached;
  pendingIssuer ??= (async () => {
    // Date the observation before the request so latency never extends freshness.
    const fetchedAt = new Date().toISOString();
    const rows = parsePreStocksIssuerCatalog(await fetchJson(PRESTOCK_ISSUER_URL), fetchedAt);
    issuerCache.set('issuer', rows, Math.max(0, 15_000 - (Date.now() - Date.parse(fetchedAt))));
    return rows;
  })().finally(() => { pendingIssuer = undefined; });
  return pendingIssuer;
}

async function fetchPreStocksCatalog(): Promise<CatalogResponse> {
  const issuers = await getIssuerCatalog();
  const verified = [...issuers.values()].filter((row): row is IssuerObservation => !(row instanceof ServiceError));
  const mints = await loadMints(verified.map(row => row.identity.mint));
  const assets: Asset[] = [];
  const unavailable: CatalogResponse['unavailable'] = [];
  for (const identity of PRESTOCK_REGISTRY) {
    try {
      const issuer = issuers.get(identity.symbol);
      if (!issuer) throw new ServiceError('unavailable', 'This asset is absent from the current PreStocks issuer catalog.');
      if (issuer instanceof ServiceError) throw issuer;
      const mint = mints.get(identity.mint);
      if (!mint) throw new ServiceError('unavailable', 'The PreStocks mint could not be verified.');
      if (mint instanceof ServiceError) throw mint;
      if (mint.tokenProgram !== TOKEN_2022_PROGRAM || mint.decimals !== identity.decimals || !mint.scaled) throw new ServiceError('unavailable', 'The PreStocks mint configuration changed and requires review.');
      assets.push({
        symbol: identity.symbol, name: identity.name, mint: identity.mint, decimals: mint.decimals, tokenProgram: mint.tokenProgram,
        halted: null, verifiedAt: issuer.fetchedAt, issuerId: 'prestocks', instrumentId: `prestocks:solana:${identity.mint}`,
        issuerSourceUrl: PRESTOCK_ISSUER_URL, productUrl: identity.productUrl, logoUrl: identity.logoUrl, logoSourceUrl: identity.logoSourceUrl,
        description: 'Pre-IPO economic exposure issued by PreStocks. Read-only planning; issuer trading-halt status is not published. Token transfer fees and issuer controls apply.',
      });
    } catch (error) { unavailable.push({ symbol: identity.symbol, message: safeMessage(error) }); }
  }
  const state = assets.length === PRESTOCK_REGISTRY.length ? 'success' : assets.length ? 'partial' : 'unavailable';
  const response: CatalogResponse = { state, assets, unavailable, ...(state === 'success' ? {} : { message: 'Some PreStocks identities or chain accounts could not be verified.' }) };
  catalogCache.set('catalog', response, state === 'success' ? 60_000 : 15_000);
  return response;
}

export async function getPreStocksCatalog(): Promise<CatalogResponse> {
  if (!rpcConfigured()) return { state: 'configuration-required', assets: [], unavailable: [], message: 'PreStocks planning needs SOLANA_RPC_URL on the server.' };
  const cached = catalogCache.get('catalog');
  if (cached) return cached;
  pendingCatalog ??= fetchPreStocksCatalog().finally(() => { pendingCatalog = undefined; });
  return pendingCatalog;
}

export async function selectedPreStocksAssets(mints: string[]): Promise<Asset[]> {
  if (mints.some(mint => !PRESTOCK_REGISTRY.some(identity => identity.mint === mint))) throw new ServiceError('invalid-input', 'Choose a verified PreStocks asset from this catalog.');
  const catalog = await getPreStocksCatalog();
  if (catalog.state === 'configuration-required') throw new ServiceError('configuration-required', catalog.message!);
  if (!catalog.assets.length) throw new ServiceError('unavailable', catalog.message!);
  return mints.map(mint => {
    const asset = catalog.assets.find(item => item.mint === mint);
    if (!asset) throw new ServiceError('invalid-input', 'Choose currently verified PreStocks assets. Reload the catalog and try again.');
    return asset;
  });
}

async function verifyPreStocksQuote(asset: Asset): Promise<{ fetchedAt: string }> {
  const issuer = (await getIssuerCatalog()).get(asset.symbol);
  if (!issuer || issuer instanceof ServiceError) throw issuer ?? new ServiceError('unavailable', 'The PreStocks issuer identity is unavailable.');
  if (issuer.identity.mint !== asset.mint) throw new ServiceError('unavailable', 'The PreStocks issuer deployment changed. Reload the catalog.', 'stale-verification');
  const snapshot = await loadMintSnapshot(asset.mint, true);
  if (snapshot.info.decimals !== issuer.identity.decimals || snapshot.info.tokenProgram !== TOKEN_2022_PROGRAM || !snapshot.info.scaled) throw new ServiceError('unavailable', 'The PreStocks mint configuration changed.', 'unsupported-token');
  const extensions = unwrapOption(snapshot.mint.extensions) ?? [];
  const metadata = extensions.find(extension => extension.__kind === 'TokenMetadata');
  if (!metadata || metadata.mint !== asset.mint || metadata.symbol !== asset.symbol || metadata.name !== issuer.identity.name || metadata.uri !== issuer.identity.metadataUrl) throw new ServiceError('unavailable', 'The PreStocks on-chain identity could not be verified.', 'stale-verification');
  const pause = extensions.find(extension => extension.__kind === 'PausableConfig');
  if (!pause) throw new ServiceError('unavailable', 'The PreStocks on-chain pause status could not be verified.', 'unsupported-token');
  if (pause.paused) throw new ServiceError('unavailable', 'The PreStocks mint is paused on-chain. Fresh estimates are unavailable.', 'issuer-halted');
  // A quote is a read-only route observation. Unsupported transfer extensions remain
  // blocked by the independent execution policy; no transfer safety is inferred here.
  return { fetchedAt: issuer.fetchedAt };
}

async function getPreStocksQuote(asset: Asset, usdcRaw: string): Promise<Quote> {
  const key = `${asset.mint}:${usdcRaw}`;
  const cached = quoteCache.get(key);
  if (cached && Date.parse(cached.expiresAt) > Date.now()) return cached;
  let pending = pendingQuotes.get(key);
  if (!pending) {
    pending = getReadOnlyQuote(asset.mint, usdcRaw, () => verifyPreStocksQuote(asset)).then(quote => {
      quoteCache.set(key, quote, Math.max(0, Math.min(5_000, Date.parse(quote.expiresAt) - Date.now())));
      return quote;
    }).catch(error => unavailableQuote(asset.mint, usdcRaw, safeMessage(error), error instanceof ServiceError ? error.reasonCode : undefined)).finally(() => pendingQuotes.delete(key));
    pendingQuotes.set(key, pending);
  }
  return pending;
}

export async function getPreStocksQuotes(items: { mint: string; usdcRaw: string }[]): Promise<QuotesResponse> {
  const assets = await selectedPreStocksAssets(items.map(item => item.mint));
  const quotes = await Promise.all(items.filter(item => BigInt(item.usdcRaw) > 0n).map(item => getPreStocksQuote(assets.find(asset => asset.mint === item.mint)!, item.usdcRaw)));
  const complete = quotes.filter(quote => quote.state === 'success' && quote.units !== null).length;
  return { state: complete === quotes.length ? 'success' : quotes.some(quote => quote.state === 'success') ? 'partial' : 'unavailable', quotes };
}
export async function getPreStocksHoldings(owner: string, mints: string[]) {
  if (!addressSchema.safeParse(owner).success) throw new ServiceError('invalid-input', 'Enter a valid Solana wallet address.');
  return getHoldingsForVerifiedAssets(owner, await selectedPreStocksAssets(mints));
}
export async function getPreStocksUnits(items: { mint: string; raw: string }[]) {
  return getUnitsForVerifiedAssets(items, await selectedPreStocksAssets(items.map(item => item.mint)));
}
