import type { Asset, BasketItem } from './types';

/** An optional illustration built only from the current verified catalog. */
export function illustrativeStarter(assets: readonly Asset[]): BasketItem[] {
  const available = assets.filter(asset => !asset.halted);
  const preferred = ['AAPLx', 'MSFTx', 'NVDAx'].flatMap(symbol => available.find(asset => asset.symbol === symbol) ?? []);
  const unique = [...new Map([...preferred, ...available].map(asset => [asset.mint, asset])).values()].slice(0, 3);
  if (unique.length !== 3) return [];
  return unique.map((asset, index) => ({ mint: asset.mint, percent: ['50', '30', '20'][index] }));
}
