# Lotline

## Short description

Lotline turns your next USDC contribution into a precise tokenized-stock plan on Solana, with verified asset identities, readable unit estimates and a split you can reuse.

## Full description

**Your next contribution, clearly.**

Lotline is a contribution planner for people who already know the tokenized stocks and ETFs they want to hold. Choose up to ten xStocks, enter a USDC budget and set your percentages. Lotline allocates every micro-USDC, shows each exact Solana mint and helps you understand the units behind the numbers.

Start without an account in the interactive Example, which includes 832 dated asset identities and clearly synthetic practice estimates. In Live mode, Lotline checks issuer data and mainnet token configuration, reads optional public-wallet holdings and requests fresh, amount-specific Jupiter estimates. Missing data remains unavailable; it never becomes a made-up price or balance.

Save a split on your device, share a plan for review, export its calculations or set a manual contribution reminder with a calendar event. Existing account users can opt into named cloud plans. The installable web app works across desktop and mobile, with offline Example planning and a downloadable brand kit.

A separate PreStocks planner brings the same exact contribution arithmetic to eight verified pre-IPO token identities. Search issuer assets, build a split, request read-only estimates, and save or share the plan with its catalog identity preserved. This flow has its own device draft and does not offer cloud saves, automatic investing or in-app purchases. Unsupported wallet-account extensions remain explicitly unavailable.

For AAPLx, MSFTx and NVDAx, Pyth references carry original publication times and confidence intervals. A planning benchmark converts the quoted USDC input with a separate USDC/USD observation, divides it by the quote's verified scaled share exposure, and compares the result with the underlying equity reference. It disappears when a required quote, price or conversion snapshot expires. It is an approximate planning comparison, not fair value, an all-in cost or the later executable order. The separate token-feed ratio remains context only because that feed's unit basis is unverified.

Fresh pinned equity and token observations are required for mapped purchase allocations, including restored reviews, and are checked again before dispatch. Production still needs its Pyth API key; authenticated live price delivery remains unverified. References never replace or extend Jupiter estimates. [Current implementation and evidence](releases/2026-09-23/quote-benchmark.md).

The contribution engine also implements explicit Wallet Standard approval, a narrow validated Jupiter/Raydium route, durable attempt history, exact-message receipt checks and recovery after uncertain results. A real unsigned mainnet order has passed validation and simulation. **Public in-app purchases remain gated on production access configuration, and real purchase settlement has not yet been verified.** The independent Jupiter handoff is available for reviewing a trade externally. Each future in-app purchase requires its own fresh review and wallet approval; reminders never invest automatically.

Lotline makes your chosen contribution understandable and repeatable. It does not choose investments, promise returns or turn tokenized exposure into shareholder rights.

[Website](https://lotline.dev) · [App](https://lotline.dev/app) · [Demo](https://lotline.dev/demo) · [Brand kit](https://lotline.dev/brand-kit) · [Source](https://github.com/operatoruplift/lotline)
