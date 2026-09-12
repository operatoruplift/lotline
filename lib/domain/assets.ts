import registry from './xstocks-registry.json' with { type: 'json' };

/** Issuer identities pinned by scripts/refresh-xstocks-catalog.mjs after Solana mint verification. */
export type XStockIdentity = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logoUrl: string;
  logoSourceUrl: string;
  issuerIsin: string;
  underlyingSymbol: string;
  underlyingIsin: string;
};

export const XSTOCK_REGISTRY: readonly Readonly<XStockIdentity>[] = registry;
export const XSTOCK_SYMBOLS = XSTOCK_REGISTRY.map(asset => asset.symbol);
export const XSTOCK_MINTS = XSTOCK_REGISTRY.map(asset => asset.mint);
export const XSTOCK_LOGO_PATHS: Readonly<Record<string, string>> = Object.fromEntries(XSTOCK_REGISTRY.map(asset => [asset.symbol, asset.logoUrl]));
export const XSTOCK_LOGO_HOST = 'xstocks-metadata.backed.fi';
const identities = new Map(XSTOCK_REGISTRY.map(asset => [asset.symbol, asset]));

export function identityForSymbol(symbol: string): Readonly<XStockIdentity> | undefined {
  return identities.get(symbol);
}

export function logoPathForSymbol(symbol: string): string | undefined {
  return identityForSymbol(symbol)?.logoUrl;
}

export function officialLogoUrlForSymbol(symbol: string): string | undefined {
  return identityForSymbol(symbol)?.logoSourceUrl;
}
