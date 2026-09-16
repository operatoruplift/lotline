import { formatUsdc } from './math';

/** Circle USDC on Solana mainnet. The only input mint Lotline ever plans from. */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Jupiter's current swap surface. The legacy `/swap/USDC-<mint>` path form is
 * NOT usable: it redirects to `?buy=So111…`, silently replacing the requested
 * output mint with SOL. Only the query form preserves the asset. */
const JUPITER_SWAP_URL = 'https://jup.ag/swap';

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Jupiter reads `inAmount` as a human decimal, not base units. Six-decimal
 * precision is honoured, so an exact micro-USDC allocation survives the handoff. */
function toInAmount(usdcRaw: string): string {
  const decimal = formatUsdc(usdcRaw);
  const trimmed = decimal.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' ? '0' : trimmed;
}

/**
 * A review link for one leg of a plan: sell USDC, buy `mint`, amount prefilled.
 * Returns null rather than a wrong link when the mint is unusable, so a caller
 * can fall back instead of sending someone to the wrong asset.
 */
export function jupiterReviewUrl(mint: string, usdcRaw?: string): string | null {
  if (typeof mint !== 'string' || !BASE58_ADDRESS.test(mint) || mint === USDC_MINT) return null;
  const url = new URL(JUPITER_SWAP_URL);
  url.searchParams.set('sell', USDC_MINT);
  url.searchParams.set('buy', mint);
  if (usdcRaw !== undefined) {
    if (!/^\d+$/.test(usdcRaw)) return null;
    const amount = toInAmount(usdcRaw);
    if (amount !== '0') url.searchParams.set('inAmount', amount);
  }
  return url.toString();
}

/** The generic swap surface, for when no single asset is in context. */
export function jupiterSwapUrl(): string {
  return JUPITER_SWAP_URL;
}
