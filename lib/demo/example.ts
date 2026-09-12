import type { Asset, Basket, Holding, HoldingsResponse, QuotesResponse } from '../domain/types';
import { logoPathForSymbol, officialLogoUrlForSymbol } from '../domain/assets';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const VERIFIED_AT = '2026-09-11T00:00:00.000Z';

// Identity, mints, and issuer metadata were fetched from api.xstocks.fi on September 12, 2026.
// Holdings, exchange rates, and multipliers below are deliberately synthetic.
export const EXAMPLE_ASSETS: Asset[] = [
  { symbol: 'AAPLx', name: 'Apple xStock', issuerIsin: 'CH1436219187', underlyingSymbol: 'AAPL', underlyingIsin: 'US0378331005', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
  { symbol: 'MSFTx', name: 'Microsoft xStock', issuerIsin: 'CH1436219203', underlyingSymbol: 'MSFT', underlyingIsin: 'US5949181045', mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX' },
  { symbol: 'NVDAx', name: 'NVIDIA xStock', issuerIsin: 'CH1436219195', underlyingSymbol: 'NVDA', underlyingIsin: 'US67066G1040', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh' },
  { symbol: 'TSLAx', name: 'Tesla xStock', issuerIsin: 'CH1436219252', underlyingSymbol: 'TSLA', underlyingIsin: 'US88160R1014', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' },
  { symbol: 'SPYx', name: 'SP500 xStock', issuerIsin: 'CH1436219716', underlyingSymbol: 'SPY', underlyingIsin: 'US78462F1030', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' },
  { symbol: 'QQQx', name: 'Nasdaq xStock', issuerIsin: 'CH1436219724', underlyingSymbol: 'QQQ', underlyingIsin: 'US46090E1038', mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ' },
].map(asset => ({ ...asset, logoUrl: logoPathForSymbol(asset.symbol), logoSourceUrl: officialLogoUrlForSymbol(asset.symbol), decimals: 8, tokenProgram: TOKEN_2022_PROGRAM, halted: false, verifiedAt: VERIFIED_AT }));

export const DEFAULT_BASKET: Basket = {
  version: 1,
  budget: '1000',
  items: EXAMPLE_ASSETS.slice(0, 3).map((asset, index) => ({ mint: asset.mint, percent: ['50', '30', '20'][index] })),
};

type ScalingFixture = { numerator: bigint; denominator: bigint; nextNumerator?: bigint; nextDenominator?: bigint; activationTime?: number };
export const EXAMPLE_CHAIN_TIME = 1_789_084_800;
export const EXAMPLE_SCALING: Record<string, ScalingFixture> = Object.fromEntries(EXAMPLE_ASSETS.map((asset, index) => [asset.mint,
  index === 0 ? { numerator: 5n, denominator: 4n, nextNumerator: 3n, nextDenominator: 2n, activationTime: EXAMPLE_CHAIN_TIME + 86_400 } :
    index === 2 ? { numerator: 3n, denominator: 2n } : { numerator: 1n, denominator: 1n },
]));
const RAW_HOLDINGS = [200_000_000n, 100_000_000n, 300_000_000n, 0n, 50_000_000n, 0n];
// Synthetic quote rates are exact raw-token-per-USDC-micro-unit fractions.
const RAW_QUOTE_RATES = [[8n, 25n], [1n, 4n], [4n, 9n], [2n, 5n], [1n, 6n], [1n, 5n]];

/** Exact rational conversion for the synthetic fixture; Live uses verified onchain scaling. */
export function exampleUnits(mint: string, raw: bigint | string, chainTime = EXAMPLE_CHAIN_TIME): string | null {
  const asset = EXAMPLE_ASSETS.find(candidate => candidate.mint === mint);
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
    const index = EXAMPLE_ASSETS.findIndex(asset => asset.mint === mint);
    if (index < 0) return { mint, state: 'unavailable', raw: null, units: null, message: 'This asset is not in the example catalog.' };
    const raw = RAW_HOLDINGS[index];
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
    const index = EXAMPLE_ASSETS.findIndex(asset => asset.mint === item.mint);
    const rate = RAW_QUOTE_RATES[index];
    const out = rate && /^\d{1,13}$/.test(item.usdcRaw) ? BigInt(item.usdcRaw) * rate[0] / rate[1] : 0n;
    if (out <= 0n) return { mint: item.mint, state: 'unavailable', usdcRaw: item.usdcRaw, outRaw: null, units: null, fetchedAt, expiresAt, message: 'This allocation is too small for an example estimate.' };
    return { mint: item.mint, state: 'success', usdcRaw: item.usdcRaw, outRaw: out.toString(), units: exampleUnits(item.mint, out), fetchedAt, expiresAt, source: 'Synthetic example' };
  });
  return { state: quotes.every(quote => quote.state === 'success') ? 'success' : quotes.some(quote => quote.state === 'success') ? 'partial' : 'unavailable', quotes, message: 'Deterministic synthetic estimates. These are not live quotes.' };
}
