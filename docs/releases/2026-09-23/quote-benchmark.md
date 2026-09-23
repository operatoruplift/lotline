# Pyth planning-estimate benchmark

This follows the [September 23 freshness release](release.md). Eight PreStocks identities and read-only estimates were verified on production. PreStocks remains a separate planning flow; no purchase or settlement is claimed.

## Resolved comparison basis

The [issuer multiplier guide](https://docs.xstocks.fi/developers/multipliers) explicitly relates scaled Solana quantities to underlying-share exposure. This supplies a benchmark independent of the ambiguous token-price feed unit:

`quoted USD per share-equivalent = (USDC input × Pyth USDC/USD) ÷ quote's converted scaled output`

Lotline compares this with the pinned underlying equity USD reference for AAPLx, MSFTx and NVDAx. The USDC feed identity was verified from [official Hermes metadata](https://hermes.pyth.network/v2/price_feeds?query=USDC&asset_type=crypto); [recorded discovery](pyth-usdc-discovery.json). Price arithmetic uses bounded integer ratios; no USD parity is assumed. Dollar results truncate to eight decimals and signed percentage differences to four, so displayed values are approximate. The converted quantity comes from the existing official Token-2022 helper before table formatting.

This is an inference from the issuer's documented unit semantics, not a claim that the two markets are interchangeable. It compares the planning quote at its original mint/Clock snapshot, not the later executable order, a guaranteed fill, fair value or total cost. Separate network fees are excluded. The UI preserves oracle confidence and publication times. It does not make a trade recommendation or add a price-deviation approval threshold.

## Freshness and scope

- The benchmark needs exact pinned equity and USDC identities, valid original publication timestamps and fresh observations. Missing currency data never becomes a one-dollar fallback.
- The quote retains its original expiry, capped at 30 seconds; its verified scaled-unit conversion must also be less than 30 seconds old. The earliest input expiry removes the comparison. Refreshing an oracle never refreshes a quote or scaling snapshot.
- The existing purchase checks still require pinned equity and token observations for mapped nonzero allocations and recheck before dispatch. This follow-up does not broaden executable routes, change access policy or sign transactions.
- The separate token-feed ratio remains context only. Its unit-basis uncertainty is not used in the planning benchmark.

## Verification and external requirements

- Local: canonical typecheck, production build and changed-file lint passed. Seventy-two targeted unit/server tests passed. The eight existing market-reference browser cases passed; the new 320px benchmark, accessibility and currency-expiry case passed after correcting a mobile-only test selector and keeping accessibility timers running while wall time is fixed.
- Independent TypeScript/security review approved the calculation, currency adapter, UI and final test changes without findings. [Mobile capture](screens/quote-benchmark-320.png) uses controlled prices (including USDC at $0.98), not live market observations.
- [CI run 35814722032](https://github.com/operatoruplift/lotline/actions/runs/35814722032) passed lint, typecheck, 512 unit tests, the production build and all 108 browser tests without retries. Two opt-in live tests were skipped. The tested head was `5f78014ecb7852693f3cb4d585d6fd0c8118f5b5`; [PR #4](https://github.com/operatoruplift/lotline/pull/4) merged it into main as `8d60e28`. Fixtures do not establish authenticated provider delivery or settlement.
- Vercel production `dpl_fVUc85c9VdnJtFeKVHsbw2gPNjPy` is READY at [lotline.dev](https://lotline.dev), with metadata matching merged SHA `8d60e287ee77a5f9ceb8862bfe888c3209bb2f45`. [Deployment identity](benchmark-deployment.json).
- [Hosted checks](benchmark-hosted.json) returned eight verified PreStocks assets and the new demo copy with preserved video. Pyth returned `configuration-required`, zero equity observations and no USDC price; execution remained disabled with receipt reconciliation available. No transaction was signed or submitted.

Production still needs Sensitive `PYTH_API_KEY` and `JUPITER_API_KEY` variables, the existing restricted access policy, and a reviewed public wallet. A funded supported route and separately authorized user wallet approval are necessary before any real settlement can be demonstrated. No seed phrase or private key belongs in the app or release evidence.

The demo page describes the new benchmark while preserving and dating the earlier recordings. Those videos do not depict the benchmark or a real settlement. Product and submission descriptions carry the same limits.
