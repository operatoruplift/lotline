# Markets, the asset sheet and the phone tab bar

Added 28 September 2026 behind the server flag `LOTLINE_MARKETS_ENABLED`. With the flag unset (the default), nothing in the planner, header or routes changes: `/markets` and `/api/markets*` answer 404, the add link is ignored and no tab bar renders. The main browser suite asserts exactly that; a second suite runs the features on a server started with the flag on.

## What people get

- **Markets (`/markets`).** Every pinned xStock (832) and PreStock (8) in one list, with the tabs All, Stocks (778), ETFs (54), Metals (5), Bonds (6) and Pre-IPO (8), search by company, ticker, underlying or mint prefix, six orderings (most traded, top gainers, top losers, deepest liquidity, name, price) and pages of 20. The filter, order, search, page and open asset live in the URL, so a view can be shared.
- **Crypto (with `LOTLINE_CRYPTO_ENABLED`).** A Crypto tab of eight pinned tokens with their issuer, bridge or stake pool; see [crypto.md](crypto.md).
- **Add to plan.** A row's **+** or the sheet's **Add to plan** writes the asset into the device draft of the matching planner (`/app` for xStocks, `/pre-ipo` for PreStocks). It takes the share still unassigned, or 0% when the split already totals 100%, and never edits the other percentages. Duplicates and an eleventh asset are refused with a reason.
- **Metals and Bonds.** Themes within the ETFs, read from each ETF's issuer-published name in the pinned registry. Metals holds the five physical-metal ETFs (GLDx, FGDLx, SLVx, PPLTx, PALLx); miners are equities and stay out. Bonds holds SGOVx and TBLLx (Treasury bills), JPSTx (ultra-short income), JAAAx and FAAAx (AAA-rated CLOs) and FLBLx (senior loans). A themed ETF also appears under ETFs. Bond exposure comes from these listed ETFs, not from treasury tokens that restrict who may hold them.
- **Leverage labels.** The nine ETFs whose names state a daily multiple (for example TQQQx 3×, SOXSx −3×, BITXx 2×) carry a "3× daily ETF" tag, and their sheet explains that the multiple resets daily, so returns over longer periods can differ widely from the stated multiple of the underlying's return.
- **Versions.** The sheet lists other ways to hold the same thing and switches to them in place. Company groups pair the same business across tokens (SpaceX: the xStock SPCXx and the PreStock SPACEX; Micron, Marvell, Intel and Sandisk with their 2× daily ETFs). Exposure groups pair funds that follow the same index or segment (S&P 500, Nasdaq-100, physical gold, semiconductors, uranium, Treasury bills, AAA CLOs, German, South Korean, US small-cap, international and European stocks). Groups are pinned in `lib/domain/market-themes.ts`, and a test fails if a member leaves the registry.
- **Asset sheet.** Price and 24-hour change, a 1D/7D/30D closing-price chart, 24-hour volume, liquidity, market cap and holders, then the verified identity: the Solana mint (copyable), the issuer, the underlying and its listing, the ETF flag's source and, where it applies, that Backpack also lists the underlying. It opens as a side panel on wide screens and a bottom sheet on phones.
- **Add link.** `/app?add=<mint>` (or `/pre-ipo?add=<mint>`) opens a review dialog before the draft changes. It states the share the asset would take and that nothing is bought or signed. Mints outside that planner's catalog are refused.
- **Phone tab bar.** At 800px and narrower: Portfolio (which also holds the planner), Markets, a raised **+**, Community (Pre-IPO while community plans are off) and Account; see [portfolio.md](portfolio.md). The **+** opens a sheet to open the planner, browse markets, open a plan link or try the Example, plus copy a community plan and plan with PreStocks when community plans are on; holding it opens the plan-link field directly. Pasted links must be same-origin `/app` or `/pre-ipo` links with a `#plan=` fragment (Example links keep `?mode=example`), and they open the existing shared-plan review.

- **Balance toward your split.** With a wallet's balances loaded, the planner can read the split as the mix someone wants to hold. It values the balances at the market snapshot and suggests how to divide this contribution among the assets below their share, in proportion to how far below they are. Nothing is sold and assets at or above their share get 0%. **Use this split for this contribution** writes the suggested percentages (exact basis points summing to 100%) and keeps the original split on the device; **Restore target split** brings it back. USDC amounts and quotes still come from the planner's exact arithmetic and fresh estimates.

## Data and freshness

| Figure | Source | Freshness |
| --- | --- | --- |
| Price, 24h change, 24h volume (buy + sell), liquidity, market cap, holders | Jupiter Tokens API v2 (`api.jup.ag/tokens/v2/search`), keyless; `JUPITER_API_KEY` is sent when configured | One snapshot of all 840 mints in 9 batches of 100, each through the shared Jupiter provider slot. Served as current for 10 minutes, then served marked "refreshing" for up to an hour while `after()` reads a new one; never served past an hour. Responses are edge-cached for 5 minutes. |
| Price history | GeckoTerminal public API: of the pools that contain the mint and hold at least $1,000, the one that traded the most in the last 24 hours, or the deepest when none traded (a pool priced against USDC, USDT or SOL wins when it does at least a fifth of that pool's trading). Locked value alone is not trusted: on 1 October 2026 a pump-token pool reported $214M locked against SOL yet traded too rarely to draw more than two points. Then its USD closes (1D hourly, 7D four-hourly, 30D daily), divided by the mint's Token-2022 display multiplier in force at each close. If the multiplier cannot be read, no chart is shown; if the latest close is more than 25% from the snapshot price, the sheet says so instead of drawing it. When the source is busy or fails (or Lotline's own read limit answers), the sheet offers **Retry**; a missing pool or too few trades is stated without one, since asking again within the hour gives the same answer. | Cached 10 minutes per mint and range, pool choice 1 hour, spaced at 2.1 s to stay under the public 30-calls-a-minute limit. |
| Stock or ETF | Nasdaq Trader's public symbol directory (`ETF` column), via `scripts/classify-xstocks.mjs`, stored in `lib/domain/xstocks-kinds.json` | Regenerate with `node scripts/classify-xstocks.mjs`; `--check` exits 1 when the pinned file differs. Hong Kong listings (79, numeric tickers) are outside the directory and are shown as shares. |

GeckoTerminal prices raw token units while Jupiter's snapshot and the planner use displayed units. Before 29 September 2026 the chart skipped that conversion, so assets with a large multiplier charted too high: TQQQx (multiplier 2.01 after a split) by about 2× and every PreStock (OPENAI's is 1.486) by about half. The conversion and the 25% guard fix it; a live check put OPENAI's latest close 0.29% from its snapshot price.

Every figure is labelled as a snapshot, never a quote. Allocations, estimates and purchases still come only from the planner's fresh Jupiter quote for the exact amount. Logos are the bundled local files, so the Content Security Policy is unchanged.

## Privacy

Markets reads no wallet, balance or account data. The only state it writes is the same local draft the planner already keeps. Snapshot and chart routes take no user input beyond a catalog mint and a range; any other address is refused before a provider is contacted.

## Turning it on

1. Set `LOTLINE_MARKETS_ENABLED=true` for the Vercel environment and redeploy. (The `/pre-ipo` page is static, so its tab bar follows the flag at build time; `/app` and `/markets` read it per request.)
2. Optionally set `JUPITER_API_KEY` to lift the keyless snapshot budget.
3. Check `/markets` shows a snapshot time, then `/app?add=<mint>` shows the review dialog.

The initial rollout kept this flag off. A read-only check on 30 September 2026 found `/markets`, `/portfolio` and `/plans` enabled on `https://lotline.dev`, served by deployment `dpl_Eqotz7bjzGRXzASgFausLkLLqWpX` from commit `11b6acd948551e4145e9908a7bfc4baf8cdc41fa`. This is a dated deployment observation; code defaults remain off, and the flags are managed separately.

## Tests

- `tests/markets-domain.test.ts`: catalog coverage and ETF counts, filtering (mint prefixes are case-sensitive), ordering with missing figures last, paging, the add-to-plan share rule, device drafts, display rounding, plan-link validation.
- `tests/markets-server.test.ts`: snapshot normalization and batching, partial and failed snapshots, the fresh/stale/expired cache with one in-flight read, pool choice, candle normalization, chart caching and rate-limit messages.
- `tests/markets-routes.test.ts`: flag-off 404s, cache headers, the after-response refresh, parameter refusal, rate limits and failures.
- `tests/e2e/markets-flag.spec.ts` (main suite, flag off) and `tests/e2e-markets/markets.spec.ts` (`npm run test:e2e:markets` against a flag-on production server): browsing, sorting, searching, adding, the sheet and its chart, snapshot outage, the add link, the phone tab bar at 320 and 390px, overflow, touch targets and axe checks.
