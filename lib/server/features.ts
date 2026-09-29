import 'server-only';
import { galleryEnabled } from './gallery';

/**
 * Markets, the asset sheet, the add-to-plan link and the mobile tab bar ship
 * dark: nothing in the judged interface changes until an operator sets
 * LOTLINE_MARKETS_ENABLED=true and redeploys.
 */
export function marketsEnabled(): boolean {
  return process.env.LOTLINE_MARKETS_ENABLED?.trim() === 'true';
}

/**
 * Solana wallet sign-in ships dark too. Turn it on only after the Web3
 * (Solana) provider is enabled in Supabase Auth and this site's address
 * passes its redirect-URL check; docs/wallet-sign-in.md has the steps.
 */
/**
 * Crypto (SOL, bitcoin and ether with a named issuer, and staked SOL) joins
 * Markets and the stock planner only with LOTLINE_CRYPTO_ENABLED; see docs/crypto.md.
 */
export function cryptoEnabled(): boolean {
  return process.env.LOTLINE_CRYPTO_ENABLED?.trim() === 'true';
}

export function walletSignInEnabled(): boolean {
  return process.env.LOTLINE_WALLET_SIGN_IN_ENABLED?.trim() === 'true';
}

/**
 * The header's flagged links, the same on every page. Static pages read this at
 * build time, and Vercel applies a changed variable only on a new deployment,
 * so every page follows a flag once it is redeployed.
 */
export function headerSections(): { markets: boolean; community: boolean } {
  const markets = marketsEnabled();
  return { markets, community: markets && galleryEnabled() };
}
