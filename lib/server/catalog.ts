import 'server-only';
import { z } from 'zod';
import type { Asset, CatalogResponse } from '../domain/types';
import { logoPathForSymbol, officialLogoUrlForSymbol, XSTOCK_LOGO_HOST } from '../domain/assets';
import { addressSchema, BoundedCache, fetchJson, safeMessage, ServiceError } from './common';
import { loadMint, rpcConfigured } from './solana';

export const CURATED_SYMBOLS = ['AAPLx', 'MSFTx', 'NVDAx', 'TSLAx', 'SPYx', 'QQQx'] as const;
const issuerSchema = z.object({
  symbol: z.string().max(16), name: z.string().min(1).max(120), isTradingHalted: z.boolean(),
  isin: z.string().max(32).optional(), underlyingSymbol: z.string().max(16).optional(), underlyingIsin: z.string().max(32).optional(),
  logo: z.string().max(300).optional(),
  trading: z.object({ isTradingHalted: z.boolean() }).optional(),
  deployments: z.array(z.object({ network: z.string(), address: z.string().max(120) })).max(100),
});
type IssuerAsset = { symbol: string; name: string; mint: string; halted: boolean; fetchedAt: string; logoSourceUrl?: string; issuerIsin?: string; underlyingSymbol?: string; underlyingIsin?: string };
const issuerCache = new BoundedCache<IssuerAsset>(12);
const catalogCache = new BoundedCache<CatalogResponse>(1);
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
  if (!parsed.success || parsed.data.symbol !== symbol) throw new ServiceError('unavailable', 'Issuer identity could not be verified.');
  const deployments = parsed.data.deployments.filter(item => item.network === 'Solana');
  if (deployments.length !== 1 || !addressSchema.safeParse(deployments[0].address).success) throw new ServiceError('unavailable', 'A unique Solana deployment is temporarily unavailable.');
  return { symbol, name: parsed.data.name, mint: deployments[0].address, halted: parsed.data.isTradingHalted || Boolean(parsed.data.trading?.isTradingHalted), fetchedAt: new Date().toISOString(), logoSourceUrl: verifiedLogoUrl(parsed.data.logo, symbol), issuerIsin: parsed.data.isin, underlyingSymbol: parsed.data.underlyingSymbol, underlyingIsin: parsed.data.underlyingIsin };
}
export async function getIssuerAsset(symbol: string): Promise<IssuerAsset> {
  if (!(CURATED_SYMBOLS as readonly string[]).includes(symbol)) throw new ServiceError('invalid-input', 'Choose an asset from the verified catalog.');
  const cached = issuerCache.get(symbol);
  if (cached) return cached;
  const parsed = parseIssuerAsset(await fetchJson(`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}`), symbol);
  // Trading halt information is refreshed at least every 30 seconds when requesting quotes.
  issuerCache.set(symbol, parsed, 30_000);
  return parsed;
}
async function fetchCatalog(): Promise<CatalogResponse> {
  const assets: Asset[] = [];
  const unavailable: CatalogResponse['unavailable'] = [];
  // A small bounded batch protects both issuer and public RPC services.
  for (let index = 0; index < CURATED_SYMBOLS.length; index += 2) {
    await Promise.all(CURATED_SYMBOLS.slice(index, index + 2).map(async symbol => {
      try {
        const issuer = await getIssuerAsset(symbol);
        const mint = await loadMint(issuer.mint);
        assets.push({ symbol, name: issuer.name, mint: issuer.mint, decimals: mint.decimals, tokenProgram: mint.tokenProgram, halted: issuer.halted, verifiedAt: issuer.fetchedAt, logoUrl: logoPathForSymbol(symbol), logoSourceUrl: issuer.logoSourceUrl, issuerIsin: issuer.issuerIsin, underlyingSymbol: issuer.underlyingSymbol, underlyingIsin: issuer.underlyingIsin });
      } catch (error) { unavailable.push({ symbol, message: safeMessage(error) }); }
    }));
  }
  assets.sort((a, b) => CURATED_SYMBOLS.indexOf(a.symbol as typeof CURATED_SYMBOLS[number]) - CURATED_SYMBOLS.indexOf(b.symbol as typeof CURATED_SYMBOLS[number]));
  const state = assets.length === CURATED_SYMBOLS.length ? 'success' : assets.length ? 'partial' : 'unavailable';
  const response: CatalogResponse = { state, assets, unavailable, ...(state === 'success' ? {} : { message: assets.length ? 'Some assets are temporarily unavailable.' : 'Issuer or chain verification is unavailable. Try Example mode or retry Live.' }) };
  catalogCache.set('catalog', response, state === 'success' ? 60 * 60_000 : 15_000);
  return response;
}
export async function getCatalog(): Promise<CatalogResponse> {
  if (!rpcConfigured()) return { state: 'configuration-required', assets: [], unavailable: [], message: 'Live needs SOLANA_RPC_URL on the server. Example mode is ready to use.' };
  const cached = catalogCache.get('catalog');
  if (cached) return cached;
  pendingCatalog ??= fetchCatalog().finally(() => { pendingCatalog = undefined; });
  return pendingCatalog;
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
