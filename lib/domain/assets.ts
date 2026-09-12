/**
 * Official xStocks logo files bundled with Lotline.
 *
 * The files are mirrored from the issuer metadata endpoint so the planner
 * does not depend on a third-party image request to render an asset identity.
 */
export const XSTOCK_LOGO_PATHS = {
  AAPLx: '/logos/xstocks/AAPLx.png',
  MSFTx: '/logos/xstocks/MSFTx.png',
  NVDAx: '/logos/xstocks/NVDAx.png',
  TSLAx: '/logos/xstocks/TSLAx.png',
  SPYx: '/logos/xstocks/SPYx.png',
  QQQx: '/logos/xstocks/QQQx.png',
} as const;

export const XSTOCK_LOGO_HOST = 'xstocks-metadata.backed.fi';

export function logoPathForSymbol(symbol: string): string | undefined {
  return XSTOCK_LOGO_PATHS[symbol as keyof typeof XSTOCK_LOGO_PATHS];
}

export function officialLogoUrlForSymbol(symbol: string): string | undefined {
  if (!logoPathForSymbol(symbol)) return undefined;
  return `https://${XSTOCK_LOGO_HOST}/logos/tokens/${encodeURIComponent(symbol)}.png`;
}
