import 'server-only';

/**
 * Markets, the asset sheet, the add-to-plan link and the mobile tab bar ship
 * dark: nothing in the judged interface changes until an operator sets
 * LOTLINE_MARKETS_ENABLED=true and redeploys.
 */
export function marketsEnabled(): boolean {
  return process.env.LOTLINE_MARKETS_ENABLED?.trim() === 'true';
}
