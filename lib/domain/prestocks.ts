/** Public issuer identities pinned after mainnet verification on 2026-09-21. */
export const PRESTOCK_ISSUER_URL = 'https://prestocks.com/api/prestocks';
export type PreStockIdentity = {
  symbol: string; name: string; mint: string; decimals: number;
  logoUrl: string; logoSourceUrl: string; productUrl: string; metadataUrl: string;
};
const identities = [
  ['ANDURIL', 'Anduril PreStocks', 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB'],
  ['ANTHROPIC', 'Anthropic PreStocks', 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw'],
  ['FIGUREAI', 'Figure AI PreStocks', 'PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd'],
  ['KALSHI', 'Kalshi PreStocks', 'PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua'],
  ['NEURALINK', 'Neuralink PreStocks', 'PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S'],
  ['OPENAI', 'OpenAI PreStocks', 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF'],
  ['POLYMARKET', 'Polymarket PreStocks', 'Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP'],
  ['SPACEX', 'SpaceX PreStocks', 'PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh'],
] as const;
export const PRESTOCK_REGISTRY: readonly Readonly<PreStockIdentity>[] = identities.map(([symbol, name, mint]) => ({
  symbol, name, mint, decimals: 9,
  logoUrl: `/logos/prestocks/${symbol}.png`,
  logoSourceUrl: `https://www.prestocks.com/logos/${symbol.toLowerCase()}.png`,
  productUrl: `https://www.prestocks.com/${symbol.toLowerCase()}`,
  metadataUrl: `https://prestocks.com/metadata/${symbol.toLowerCase()}.json`,
}));
export const PRESTOCK_SYMBOLS = PRESTOCK_REGISTRY.map(asset => asset.symbol);
export function preStockIdentityForSymbol(symbol: string): Readonly<PreStockIdentity> | undefined {
  return PRESTOCK_REGISTRY.find(asset => asset.symbol === symbol);
}
