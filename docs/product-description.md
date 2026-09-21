# Lotline product descriptions

Last updated September 21, 2026. See [current sponsor evidence](sponsor-release-20260921.md) for deployment and access status.

No em dashes are used in this file. Keep it that way when editing.

## Short description

Lotline turns your next USDC contribution into an exact tokenized-stock split on Solana, with verified mints, amount-specific unit estimates, and a plan you can save, share and review on Jupiter.

## Full description

**Your next contribution, clearly.**

Lotline is a contribution planner for people who already know which tokenized stocks and ETFs they want to hold. Choose up to ten xStocks, enter a USDC budget, and set your percentages. Lotline allocates every micro-USDC, shows the exact Solana mint behind each asset, and makes the units behind the numbers readable.

Start with no account in the interactive Example, which carries 832 dated asset identities and clearly synthetic practice estimates. In Live mode, Lotline verifies issuer data and mainnet token configuration, optionally reads a public wallet's holdings, and requests fresh, amount-specific Jupiter estimates. Missing data stays unavailable. It never becomes an invented price or balance.

Precision is the product. Budgets carry six decimal places, allocation runs on BigInt micro-units and integer basis points, and leftover micro-units are distributed by largest remainder. Token-2022 Scaled UI Amount conversion uses the official helper and chain time. Estimates expire within 30 seconds, and every copy or CSV export preserves the original quote time alongside an explicit fresh, stale or unavailable state.

Save a split on your device, share a plan for review, export the calculations, or set a manual contribution reminder as a calendar event. Existing account holders can opt into named cloud plans, which store only the plan name, verified mints, weights and budget under row-level security. Wallet addresses, balances and quotes are never saved and never enter a share link. The installable web app runs across desktop and mobile, and Example planning keeps working offline.

A separate PreStocks planner brings the same arithmetic to eight verified pre-IPO token identities, with its own device draft, no cloud saves and no in-app purchases. Unsupported wallet-account extensions stay explicitly unavailable.

For AAPLx, MSFTx and NVDAx, an optional Pyth panel can show underlying-equity and token USD observations with their original publication times and confidence intervals. Live delivery requires a configured Pyth API key. The token feed's unit basis is unverified, so Lotline does not calculate a premium, a discount or an oracle-equivalent execution price. Reference data never replaces a Jupiter estimate.

The contribution engine implements explicit Wallet Standard approval, a narrow validated Jupiter and Raydium route, durable attempt history, exact-message receipt checks, and recovery after an uncertain result. A real unsigned mainnet order has passed validation and simulation. **Public in-app purchases remain gated on production access configuration, and real purchase settlement has not been verified.** The independent Jupiter handoff opens the official swap page with your mint and exact USDC amount prefilled, so a trade is reviewed and approved outside Lotline. Each future in-app purchase requires its own fresh review and wallet approval, and reminders never invest automatically.

Lotline never takes custody, never signs without explicit approval, and cannot confirm that a purchase happened. It makes your chosen contribution understandable and repeatable. It does not choose investments, promise returns, or turn tokenized exposure into shareholder rights.

[Website](https://lotlineonsolana.vercel.app) · [App](https://lotlineonsolana.vercel.app/app) · [Demo](https://lotlineonsolana.vercel.app/demo) · [Brand kit](https://lotlineonsolana.vercel.app/brand-kit) · [Source](https://github.com/operatoruplift/lotline)
