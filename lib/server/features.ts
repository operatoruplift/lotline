import 'server-only';

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
export function walletSignInEnabled(): boolean {
  return process.env.LOTLINE_WALLET_SIGN_IN_ENABLED?.trim() === 'true';
}
