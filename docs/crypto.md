# Crypto

Added 29 September 2026 behind the server flag `LOTLINE_CRYPTO_ENABLED` (off by default). With it unset, nothing crypto appears anywhere: Markets, Portfolio and the planner list exactly what they did before, and the catalog, quotes and holdings never read a crypto mint.

## What people get

- **A short, named list.** Eight tokens, pinned in `lib/domain/crypto-assets.ts` with bundled logos:

  | Token | What stands behind it | Kind |
  | --- | --- | --- |
  | SOL | SOL itself, wrapped as a token so it can sit in a plan | Coin |
  | cbBTC | Bitcoin held by Coinbase, one for one; **Coinbase can freeze balances** | Bridged BTC |
  | WBTC | Wrapped bitcoin locked in the Wormhole Portal bridge | Bridged BTC |
  | ETH | Ether locked in the Wormhole Portal bridge | Bridged ETH |
  | JitoSOL, mSOL, JupSOL, INF | SOL staked in the Jito, Marinade, Jupiter and Sanctum pools; each redeems for more SOL as rewards accrue | Staked SOL |

  Each mint was checked on Solana mainnet (SPL Token program, decimals, mint and freeze authorities) and is on Jupiter's strict verified list. Tokens without an identified issuer or bridge stay out.
- **Markets.** A **Crypto** tab (8) beside Stocks, ETFs, Metals, Bonds and Pre-IPO, with the same dated snapshot, chart and **Add to plan**. The sheet names the issuer, bridge or stake pool, says what backs one token and flags a freeze authority. Its versions group bitcoin (cbBTC, WBTC and the 2× bitcoin ETF BITXx) and Solana (SOL and the staked tokens).
- **One plan across stocks and crypto.** Crypto joins the xStocks planner, so a split can hold AAPLx and SOL together. The catalog then reads "N verified assets" and the search "Search stocks, ETFs and crypto"; without crypto both read as before. Portfolio adds a **Crypto** tile and counts crypto as its own type in a plan's mix.
- **Saved, shared and followed** plans can hold these tokens (see Data).

## How it is verified

- **Catalog.** `cryptoCatalog()` in `lib/server/catalog.ts` re-reads every pinned mint from the chain. A token is listed only while its mint is still an SPL Token mint with the pinned decimals; otherwise it is reported unavailable with a reason. A failed chain read lists none of them. Crypto has no issuer halt flag, so `halted` is false, meaning no halt exists, never that one went unchecked.
- **Estimates.** Quotes use the same Jupiter quote-only request as stocks and skip only the xStocks issuer re-check, which crypto does not have.
- **Holdings.** SOL counts the wallet's native lamports as well as any wrapped SOL in token accounts, so a wallet holding SOL shows it.
- **Buying in Lotline** stays stocks-only: the execution validator accepts xStock mints, so a plan with crypto is estimated and exported but not bought in-app.

## Data

`supabase/migrations/20260929160000_crypto_plan_mints.sql` appends the eight mints to `lotline_private.valid_plan_allocations`, which checks saved plans and cloud reminders. It edits the reviewed definition in place instead of restating 840 mints, stops if that definition changed, and does nothing when rerun; the 832 xStocks and every other rule are unchanged. Applied to production on 29 September 2026. The server's plan and community-plan schemas accept the same list.

## Turning it on

1. Apply `20260929160000_crypto_plan_mints.sql` (saving a plan with crypto fails until it is applied).
2. Set `LOTLINE_CRYPTO_ENABLED=true` with `LOTLINE_MARKETS_ENABLED=true` and redeploy.

## Tests

- `tests/markets-domain.test.ts`: the registry (eight named tokens, bundled logos, no overlap with the stock catalogs, only cbBTC freezable), labels, the Crypto filter and search, the Bitcoin versions group, and that crypto joins the stock planner but never the PreStocks one.
- `tests/crypto-server.test.ts`: chain verification (decimals or program mismatch and chain failure make a token unavailable), the combined catalog state, native SOL in holdings, and saved and shared plans accepting crypto but not an unlisted mint.
- `tests/crypto-quotes.test.ts`: crypto quotes skip the issuer check; stock quotes keep it.
- `tests/markets-routes.test.ts`: the chart endpoint serves crypto only with the crypto flag.
- `tests/gallery-database.test.ts`: the database accepts a saved plan mixing xStocks and crypto and still refuses USDC.
- `tests/e2e-markets/crypto.spec.ts` (flag on): the Crypto tab, cbBTC's sheet (issuer, freeze, backing, bitcoin versions, axe) and adding it to the plan; the planner offering crypto and placing SOL in a split. `tests/e2e-markets/portfolio.spec.ts` checks the Crypto tile.
