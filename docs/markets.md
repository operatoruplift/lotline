# Markets, the asset sheet and the phone tab bar

Added 28 September 2026 behind the server flag `LOTLINE_MARKETS_ENABLED`. With the flag unset (the default, and production until an operator turns it on), nothing in the planner, header or routes changes: `/markets` and `/api/markets*` answer 404, the add link is ignored and no tab bar renders. The main browser suite asserts exactly that; a second suite runs the features on a server started with the flag on.

## What people get

- **Markets (`/markets`).** Every pinned xStock (832) and PreStock (8) in one list, with the type tabs All, Stocks (778), ETFs (54) and Pre-IPO (8), search by company, ticker, underlying or mint prefix, six orderings (most traded, top gainers, top losers, deepest liquidity, name, price) and pages of 20. The filter, order, search, page and open asset live in the URL, so a view can be shared.
- **Add to plan.** A row's **+** or the sheet's **Add to plan** writes the asset into the device draft of the matching planner (`/app` for xStocks, `/pre-ipo` for PreStocks). It takes the share still unassigned, or 0% when the split already totals 100%, and never edits the other percentages. Duplicates and an eleventh asset are refused with a reason.
- **Asset sheet.** Price and 24-hour change, a 1D/7D/30D closing-price chart, 24-hour volume, liquidity, market cap and holders, then the verified identity: the Solana mint (copyable), the issuer, the underlying and its listing, the ETF flag's source and, where it applies, that Backpack also lists the underlying. It opens as a side panel on wide screens and a bottom sheet on phones.
- **Add link.** `/app?add=<mint>` (or `/pre-ipo?add=<mint>`) opens a review dialog before the draft changes. It states the share the asset would take and that nothing is bought or signed. Mints outside that planner's catalog are refused.
- **Phone tab bar.** At 800px and narrower: Plan, Markets, a raised **+**, Pre-IPO and Account. The **+** opens a sheet to browse markets, open a plan link or try the Example; holding it opens the plan-link field directly. Pasted links must be same-origin `/app` or `/pre-ipo` links with a `#plan=` fragment (Example links keep `?mode=example`), and they open the existing shared-plan review.

- **Balance toward your split.** With a wallet's balances loaded, the planner can read the split as the mix someone wants to hold. It values the balances at the market snapshot and suggests how to divide this contribution among the assets below their share, in proportion to how far below they are. Nothing is sold and assets at or above their share get 0%. **Use this split for this contribution** writes the suggested percentages (exact basis points summing to 100%) and keeps the original split on the device; **Restore target split** brings it back. USDC amounts and quotes still come from the planner's exact arithmetic and fresh estimates.

## Data and freshness

| Figure | Source | Freshness |
| --- | --- | --- |
| Price, 24h change, 24h volume (buy + sell), liquidity, market cap, holders | Jupiter Tokens API v2 (`api.jup.ag/tokens/v2/search`), keyless; `JUPITER_API_KEY` is sent when configured | One snapshot of all 840 mints in 9 batches of 100, each through the shared Jupiter provider slot. Served as current for 10 minutes, then served marked "refreshing" for up to an hour while `after()` reads a new one; never served past an hour. Responses are edge-cached for 5 minutes. |
| Price history | GeckoTerminal public API: the deepest pool that contains the mint and holds at least $1,000, then its USD closes (1D hourly, 7D four-hourly, 30D daily) | Cached 10 minutes per mint and range, pool choice 1 hour, spaced at 2.1 s to stay under the public 30-calls-a-minute limit. |
| Stock or ETF | Nasdaq Trader's public symbol directory (`ETF` column), via `scripts/classify-xstocks.mjs`, stored in `lib/domain/xstocks-kinds.json` | Regenerate with `node scripts/classify-xstocks.mjs`; `--check` exits 1 when the pinned file differs. Hong Kong listings (79, numeric tickers) are outside the directory and are shown as shares. |

Every figure is labelled as a snapshot, never a quote. Allocations, estimates and purchases still come only from the planner's fresh Jupiter quote for the exact amount. Logos are the bundled local files, so the Content Security Policy is unchanged.

## Privacy

Markets reads no wallet, balance or account data. The only state it writes is the same local draft the planner already keeps. Snapshot and chart routes take no user input beyond a catalog mint and a range; any other address is refused before a provider is contacted.

## Turning it on

1. Set `LOTLINE_MARKETS_ENABLED=true` for the Vercel environment and redeploy. (The `/pre-ipo` page is static, so its tab bar follows the flag at build time; `/app` and `/markets` read it per request.)
2. Optionally set `JUPITER_API_KEY` to lift the keyless snapshot budget.
3. Check `/markets` shows a snapshot time, then `/app?add=<mint>` shows the review dialog.

The flag was kept off while Stocklana judging runs (until 2 October 2026) so the judged interface stays exactly as submitted.

## Tests

- `tests/markets-domain.test.ts`: catalog coverage and ETF counts, filtering (mint prefixes are case-sensitive), ordering with missing figures last, paging, the add-to-plan share rule, device drafts, display rounding, plan-link validation.
- `tests/markets-server.test.ts`: snapshot normalization and batching, partial and failed snapshots, the fresh/stale/expired cache with one in-flight read, pool choice, candle normalization, chart caching and rate-limit messages.
- `tests/markets-routes.test.ts`: flag-off 404s, cache headers, the after-response refresh, parameter refusal, rate limits and failures.
- `tests/e2e/markets-flag.spec.ts` (main suite, flag off) and `tests/e2e-markets/markets.spec.ts` (`npm run test:e2e:markets` against a flag-on production server): browsing, sorting, searching, adding, the sheet and its chart, snapshot outage, the add link, the phone tab bar at 320 and 390px, overflow, touch targets and axe checks.
