import 'server-only';
import { z } from 'zod';
import type { Asset, CatalogResponse } from '../domain/types';
import { identityForSymbol, logoPathForSymbol, officialLogoUrlForSymbol, XSTOCK_LOGO_HOST, XSTOCK_SYMBOLS } from '../domain/assets';
import { CRYPTO_REGISTRY, SPL_TOKEN_PROGRAM } from '../domain/crypto-assets';
import { cryptoEnabled } from './features';
import { addressSchema, BoundedCache, fetchJson, safeMessage, ServiceError } from './common';
import { loadMints, rpcConfigured } from './solana';

export const CURATED_SYMBOLS = XSTOCK_SYMBOLS;
const PAGE_SIZE = 100;
const MAX_ISSUER_PAGES = 20;
const issuerSchema = z.object({
  symbol: z.string().max(16), name: z.string().min(1).max(120), isTradingHalted: z.boolean(),
  isin: z.string().max(32).optional(), underlyingSymbol: z.string().max(16).optional(), underlyingIsin: z.string().max(32).optional(),
  underlying: z.object({ symbol: z.string().max(16), isin: z.string().max(32).nullable().optional() }).nullable().optional(),
  logo: z.string().max(300).optional(),
  trading: z.object({ isTradingHalted: z.boolean() }).nullable().optional(),
  deployments: z.array(z.object({ network: z.string(), address: z.string().max(120) })).max(100),
});
const issuerPageSchema = z.object({
  nodes: z.array(z.unknown()).max(PAGE_SIZE),
  page: z.object({ currentPage: z.number().int().nonnegative(), hasNextPage: z.boolean() }),
});
type IssuerAsset = { symbol: string; name: string; mint: string; halted: boolean; fetchedAt: string; logoSourceUrl?: string; issuerIsin?: string; underlyingSymbol?: string; underlyingIsin?: string };
const issuerCache = new BoundedCache<IssuerAsset>(2_000);
const catalogCache = new BoundedCache<CatalogResponse>(1);
const cryptoCache = new BoundedCache<Pick<CatalogResponse, 'assets' | 'unavailable'>>(1);
let pendingCatalog: Promise<CatalogResponse> | undefined;

function verifiedLogoUrl(value: string | undefined, symbol: string): string | undefined {
  const expected = officialLogoUrlForSymbol(symbol);
  if (!value || !expected) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== XSTOCK_LOGO_HOST || url.pathname !== `/logos/tokens/${symbol}.png` || url.search || url.hash) return undefined;
    return url.href === expected ? expected : undefined;
  } catch {
    return undefined;
  }
}

export function parseIssuerAsset(payload: unknown, symbol: string): IssuerAsset {
  const parsed = issuerSchema.safeParse(payload);
  const identity = identityForSymbol(symbol);
  if (!parsed.success || parsed.data.symbol !== symbol || !identity) throw new ServiceError('unavailable', 'Issuer identity could not be verified.');
  const deployments = parsed.data.deployments.filter(item => item.network === 'Solana');
  if (deployments.length !== 1 || !addressSchema.safeParse(deployments[0].address).success) throw new ServiceError('unavailable', 'A unique Solana deployment is temporarily unavailable.');
  if (deployments[0].address !== identity.mint) throw new ServiceError('unavailable', 'The issuer deployment has changed and requires catalog review.');
  return { symbol, name: parsed.data.name, mint: deployments[0].address, halted: parsed.data.isTradingHalted || Boolean(parsed.data.trading?.isTradingHalted), fetchedAt: new Date().toISOString(), logoSourceUrl: verifiedLogoUrl(parsed.data.logo, symbol), issuerIsin: parsed.data.isin, underlyingSymbol: parsed.data.underlying?.symbol ?? parsed.data.underlyingSymbol, underlyingIsin: parsed.data.underlying?.isin ?? parsed.data.underlyingIsin };
}

export function parseIssuerPage(payload: unknown, expectedPage: number) {
  const parsed = issuerPageSchema.safeParse(payload);
  if (!parsed.success || parsed.data.page.currentPage !== expectedPage || (parsed.data.page.hasNextPage && parsed.data.nodes.length !== PAGE_SIZE)) throw new ServiceError('unavailable', 'The issuer catalog page could not be verified.');
  return parsed.data;
}

export async function getIssuerAsset(symbol: string, options?: { fresh?: boolean }): Promise<IssuerAsset> {
  if (!identityForSymbol(symbol)) throw new ServiceError('invalid-input', 'Choose an asset from the verified catalog.');
  const cached = issuerCache.get(symbol);
  if (cached && !options?.fresh) return cached;
  const parsed = parseIssuerAsset(await fetchJson(`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}`), symbol);
  // Quotes always recheck halt flags against issuer data no older than 30 seconds.
  issuerCache.set(symbol, parsed, 30_000);
  return parsed;
}

async function fetchIssuerCatalog(): Promise<Map<string, IssuerAsset | ServiceError>> {
  const fetchPage = async (page: number) => {
    const payload = await fetchJson(`https://api.xstocks.fi/api/v2/public/assets?network=Solana&pageSize=${PAGE_SIZE}&page=${page}`);
    return { ...parseIssuerPage(payload, page), fetchedAt: new Date().toISOString() };
  };
  const pages = [await fetchPage(0)];
  // The pinned registry tells us the expected page count. Four concurrent requests avoid
  // hundreds of per-symbol HTTP calls; a bounded tail accommodates new issuer listings.
  const expectedPages = Math.min(MAX_ISSUER_PAGES, Math.ceil(CURATED_SYMBOLS.length / PAGE_SIZE));
  for (let start = 1; start < expectedPages && pages.at(-1)!.page.hasNextPage; start += 4) {
    const indexes = Array.from({ length: Math.min(4, expectedPages - start) }, (_, index) => start + index);
    const nextPages = await Promise.all(indexes.map(fetchPage));
    for (const page of nextPages) {
      if (!pages.at(-1)!.page.hasNextPage) break;
      pages.push(page);
    }
  }
  while (pages.at(-1)!.page.hasNextPage) {
    if (pages.length >= MAX_ISSUER_PAGES) throw new ServiceError('unavailable', 'The issuer catalog exceeds the supported verification limit.');
    pages.push(await fetchPage(pages.length));
  }
  const assets = new Map<string, IssuerAsset | ServiceError>();
  const seen = new Set<string>();
  for (const page of pages) {
    for (const row of page.nodes) {
      const symbol = z.object({ symbol: z.string() }).safeParse(row);
      if (!symbol.success || !identityForSymbol(symbol.data.symbol)) continue;
      const key = symbol.data.symbol;
      if (seen.has(key)) {
        assets.set(key, new ServiceError('unavailable', 'The issuer returned an ambiguous asset identity.'));
        continue;
      }
      seen.add(key);
      try { assets.set(key, { ...parseIssuerAsset(row, key), fetchedAt: page.fetchedAt }); }
      catch (error) { assets.set(key, error instanceof ServiceError ? error : new ServiceError('unavailable', 'Issuer identity could not be verified.')); }
    }
  }
  // Catalog pagination must never extend quote halt freshness. Only individual
  // getIssuerAsset reads populate the short-lived quote verification cache.
  return assets;
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const assets: Asset[] = [];
  const unavailable: CatalogResponse['unavailable'] = [];
  const issuers = await fetchIssuerCatalog();
  const verifiedIssuers = [...issuers.values()].filter((issuer): issuer is IssuerAsset => !(issuer instanceof ServiceError));
  const mints = await loadMints(verifiedIssuers.map(issuer => issuer.mint));
  for (const symbol of CURATED_SYMBOLS) {
    try {
      const issuer = issuers.get(symbol);
      if (!issuer) throw new ServiceError('unavailable', 'This asset is absent from the current issuer catalog.');
      if (issuer instanceof ServiceError) throw issuer;
      const mint = mints.get(issuer.mint);
      if (!mint) throw new ServiceError('unavailable', 'The chain account could not be verified.');
      if (mint instanceof ServiceError) throw mint;
      assets.push({ symbol, name: issuer.name, mint: issuer.mint, decimals: mint.decimals, tokenProgram: mint.tokenProgram, halted: issuer.halted, verifiedAt: issuer.fetchedAt, logoUrl: logoPathForSymbol(symbol), logoSourceUrl: issuer.logoSourceUrl, issuerIsin: issuer.issuerIsin, underlyingSymbol: issuer.underlyingSymbol, underlyingIsin: issuer.underlyingIsin });
    } catch (error) { unavailable.push({ symbol, message: safeMessage(error) }); }
  }
  const state = assets.length === CURATED_SYMBOLS.length ? 'success' : assets.length ? 'partial' : 'unavailable';
  const response: CatalogResponse = { state, assets, unavailable, ...(state === 'success' ? {} : { message: assets.length ? 'Some assets are temporarily unavailable.' : 'Issuer or chain verification is unavailable. Try Example mode or retry Live.' }) };
  catalogCache.set('catalog', response, state === 'success' ? 60 * 60_000 : 15_000);
  return response;
}
export async function getCatalog(): Promise<CatalogResponse> {
  if (!rpcConfigured()) return { state: 'configuration-required', assets: [], unavailable: [], message: 'Live needs SOLANA_RPC_URL on the server. Example mode is ready to use.' };
  const cached = catalogCache.get('catalog');
  const stocks = cached ?? await (pendingCatalog ??= fetchCatalog().finally(() => { pendingCatalog = undefined; }));
  return cryptoEnabled() ? withCrypto(stocks, await cryptoCatalog()) : stocks;
}

/**
 * Pinned crypto, re-verified against the chain: each mint must still be an SPL
 * Token mint with its pinned decimals. Crypto has no issuer halt flag, so
 * `halted` is false, meaning no halt exists, never that one went unchecked.
 */
export async function cryptoCatalog(load: typeof loadMints = loadMints): Promise<Pick<CatalogResponse, 'assets' | 'unavailable'>> {
  const cached = cryptoCache.get('crypto');
  if (cached) return cached;
  const verifiedAt = new Date().toISOString();
  let mints: Awaited<ReturnType<typeof loadMints>>;
  try { mints = await load(CRYPTO_REGISTRY.map(asset => asset.mint)); }
  catch (error) { return { assets: [], unavailable: CRYPTO_REGISTRY.map(asset => ({ symbol: asset.symbol, message: safeMessage(error) })) }; }
  const assets: Asset[] = [];
  const unavailable: CatalogResponse['unavailable'] = [];
  for (const asset of CRYPTO_REGISTRY) {
    const mint = mints.get(asset.mint);
    if (!mint || mint instanceof ServiceError) { unavailable.push({ symbol: asset.symbol, message: mint ? safeMessage(mint) : 'The chain account could not be verified.' }); continue; }
    if (mint.decimals !== asset.decimals || mint.tokenProgram !== SPL_TOKEN_PROGRAM) { unavailable.push({ symbol: asset.symbol, message: 'This mint no longer matches its pinned identity and needs review.' }); continue; }
    assets.push({ symbol: asset.symbol, name: asset.name, mint: asset.mint, decimals: mint.decimals, tokenProgram: mint.tokenProgram, halted: false, verifiedAt, logoUrl: asset.logoUrl, underlyingSymbol: asset.underlying });
  }
  const result = { assets, unavailable };
  cryptoCache.set('crypto', result, unavailable.length ? 15_000 : 60 * 60_000);
  return result;
}

/** The stock catalog with verified crypto appended; its state reflects both. */
export function withCrypto(stocks: CatalogResponse, crypto: Pick<CatalogResponse, 'assets' | 'unavailable'>): CatalogResponse {
  if (stocks.state === 'configuration-required') return stocks;
  const assets = [...stocks.assets, ...crypto.assets];
  const unavailable = [...stocks.unavailable, ...crypto.unavailable];
  const state = unavailable.length === 0 ? 'success' : assets.length ? 'partial' : 'unavailable';
  return { state, assets, unavailable, ...(state === 'success' ? {} : { message: stocks.message ?? (assets.length ? 'Some assets are temporarily unavailable.' : 'Issuer or chain verification is unavailable. Try Example mode or retry Live.') }) };
}
export async function selectedAssets(mints: string[]): Promise<Asset[]> {
  const catalog = await getCatalog();
  if (catalog.state === 'configuration-required') throw new ServiceError('configuration-required', catalog.message!);
  if (!catalog.assets.length) throw new ServiceError('unavailable', catalog.message!);
  return mints.map(mint => {
    const asset = catalog.assets.find(item => item.mint === mint);
    if (!asset) throw new ServiceError('invalid-input', 'Choose currently verified assets from the catalog. Reload the catalog and try again.');
    return asset;
  });
}
