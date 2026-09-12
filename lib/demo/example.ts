import type { Asset, Basket, Holding, HoldingsResponse, QuotesResponse } from '../domain/types';
import { XSTOCK_REGISTRY } from '../domain/assets';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const VERIFIED_AT = '2026-09-12T09:35:04.305Z';

// Reuse the complete reviewed identity/logo snapshot. This is not a current mint
// or halt check: Example balances, conversion rates and multipliers are synthetic.
export const EXAMPLE_ASSETS: Asset[] = XSTOCK_REGISTRY.map(asset => ({
  ...asset, tokenProgram: TOKEN_2022_PROGRAM, halted: false, verifiedAt: VERIFIED_AT,
}));
const exampleAssetsByMint = new Map(EXAMPLE_ASSETS.map(asset => [asset.mint, asset]));

export const DEFAULT_BASKET: Basket = {
  version: 1,
  budget: '1000',
  items: EXAMPLE_ASSETS.slice(0, 3).map((asset, index) => ({ mint: asset.mint, percent: ['50', '30', '20'][index] })),
};

type ScalingFixture = { numerator: bigint; denominator: bigint; nextNumerator?: bigint; nextDenominator?: bigint; activationTime?: number };
export const EXAMPLE_CHAIN_TIME = 1_789_084_800;
export const EXAMPLE_SCALING: Record<string, ScalingFixture> = Object.fromEntries(EXAMPLE_ASSETS.map(asset => [asset.mint,
  asset.symbol === 'AAPLx' ? { numerator: 5n, denominator: 4n, nextNumerator: 3n, nextDenominator: 2n, activationTime: EXAMPLE_CHAIN_TIME + 86_400 } :
    asset.symbol === 'NVDAx' ? { numerator: 3n, denominator: 2n } : { numerator: 1n, denominator: 1n },
]));
type ExampleInputs = { rawHolding: bigint; rawQuoteRate: readonly [bigint, bigint] };
// Preserve the original walkthrough exactly, independently of catalog ordering.
const originalInputs = new Map<string, ExampleInputs>([
  ['AAPLx', { rawHolding: 200_000_000n, rawQuoteRate: [8n, 25n] }],
  ['MSFTx', { rawHolding: 100_000_000n, rawQuoteRate: [1n, 4n] }],
  ['NVDAx', { rawHolding: 300_000_000n, rawQuoteRate: [4n, 9n] }],
  ['TSLAx', { rawHolding: 0n, rawQuoteRate: [2n, 5n] }],
  ['SPYx', { rawHolding: 50_000_000n, rawQuoteRate: [1n, 6n] }],
  ['QQQx', { rawHolding: 0n, rawQuoteRate: [1n, 5n] }],
]);
// Additional assets use zero illustrative holdings and the same deliberately
// generic 1 unit per 100 USDC. This is not a market price or route observation.
// Each fraction converts micro-USDC directly to raw tokens at the pinned precision.
const exampleInputsByMint = new Map(EXAMPLE_ASSETS.map(asset => [asset.mint,
  originalInputs.get(asset.symbol) ?? { rawHolding: 0n, rawQuoteRate: [10n ** BigInt(asset.decimals), 100_000_000n] as const },
]));

/** Exact rational conversion for the synthetic fixture; Live uses verified onchain scaling. */
export function exampleUnits(mint: string, raw: bigint | string, chainTime = EXAMPLE_CHAIN_TIME): string | null {
  const asset = exampleAssetsByMint.get(mint);
  const scale = EXAMPLE_SCALING[mint];
  if (!asset || !scale || (typeof raw === 'string' && !/^\d{1,40}$/.test(raw))) return null;
  const amount = BigInt(raw);
  if (amount < 0n) return null;
  const activated = scale.activationTime !== undefined && chainTime >= scale.activationTime;
  const numerator = activated ? scale.nextNumerator : scale.numerator;
  const denominator = activated ? scale.nextDenominator : scale.denominator;
  if (numerator === undefined || denominator === undefined || denominator <= 0n) return null;
  // Floor once at mint precision, matching a displayed scaled-unit amount.
  const scaled = amount * numerator / denominator;
  const unit = 10n ** BigInt(asset.decimals);
  const fraction = (scaled % unit).toString().padStart(asset.decimals, '0').replace(/0+$/, '');
  return `${scaled / unit}${fraction ? `.${fraction}` : ''}`;
}

export function getExampleHoldings(mints: string[]): HoldingsResponse {
  const holdings: Holding[] = mints.map(mint => {
    const fixture = exampleInputsByMint.get(mint);
    if (!fixture) return { mint, state: 'unavailable', raw: null, units: null, message: 'This asset is not in the example catalog.' };
    const raw = fixture.rawHolding;
    return { mint, state: 'success', raw: raw.toString(), units: exampleUnits(mint, raw) };
  });
  return {
    state: holdings.every(holding => holding.state === 'success') ? 'success' : 'partial',
    holdings,
    usdc: { mint: USDC_MINT, state: 'success', raw: '2450500000', units: '2450.5' },
    fetchedAt: new Date().toISOString(),
    message: 'Synthetic example holdings. No wallet address was loaded.',
  };
}

export function getExampleQuotes(items: { mint: string; usdcRaw: string }[]): QuotesResponse {
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(fetchedAt) + 30_000).toISOString();
  const quotes: QuotesResponse['quotes'] = items.filter(item => item.usdcRaw !== '0').map(item => {
    const fixture = exampleInputsByMint.get(item.mint);
    if (!fixture) return { mint: item.mint, state: 'unavailable', usdcRaw: item.usdcRaw, outRaw: null, units: null, fetchedAt, expiresAt, message: 'This asset is not in the example catalog.' };
    const rate = fixture.rawQuoteRate;
    const out = /^\d{1,13}$/.test(item.usdcRaw) ? BigInt(item.usdcRaw) * rate[0] / rate[1] : 0n;
    if (out <= 0n) return { mint: item.mint, state: 'unavailable', usdcRaw: item.usdcRaw, outRaw: null, units: null, fetchedAt, expiresAt, message: 'This allocation is too small for an example estimate.' };
    return { mint: item.mint, state: 'success', usdcRaw: item.usdcRaw, outRaw: out.toString(), units: exampleUnits(item.mint, out), fetchedAt, expiresAt, source: 'Synthetic example' };
  });
  return { state: quotes.every(quote => quote.state === 'success') ? 'success' : quotes.some(quote => quote.state === 'success') ? 'partial' : 'unavailable', quotes, message: 'Deterministic synthetic estimates. These are not live quotes.' };
}
