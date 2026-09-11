# Lotline — product descriptions

## Short description

Lotline turns your next USDC contribution into a precise xStocks plan: choose your split, check balances and estimates, and take the plan to Jupiter.

## Full description

# Lotline

**A clear plan for your next xStocks contribution.**

You know which assets you want to contribute to. The next question is practical: how should this USDC contribution be split, and approximately how many units would it add?

Lotline brings that calculation into one focused workspace. Choose up to three issuer-verified xStocks on Solana, set your own percentages, enter a USDC budget, and request quote estimates. Add a public wallet address to see current holdings alongside the estimated contribution and resulting units. Then copy the plan, download a CSV, or open Jupiter to independently review a trade.

### Your contribution, your choices

A saved split keeps your chosen assets, percentages, and budget ready for the next visit. The percentages apply to the new contribution. Lotline does not choose an allocation for you or treat those percentages as targets for your existing portfolio.

A 10.000001 USDC contribution split 50/30/20 becomes exactly 5.000001, 3.000000, and 2.000000 USDC. Every micro-USDC is accounted for with integer arithmetic, including amounts that do not divide evenly.

### Real holdings, clear estimates

Wallet lookup is read-only. Paste a public Solana address to load the selected xStock balances and mainnet USDC without a wallet extension or signature. Lotline distinguishes a confirmed zero balance from data that could not be loaded.

Asset identity comes from the issuer's official metadata and is checked against the deployed Solana mint. Estimates come from Jupiter's quote-only endpoint. Each result carries its retrieval time, becomes stale after at most 30 seconds, and clears when the plan changes. An unavailable route or service appears as an honest unavailable state.

Solana xStocks use Token-2022 Scaled UI Amount. Lotline uses the official mint-aware conversion path and chain time to display units. For estimated resulting holdings, it adds raw current units to raw quote output before conversion. This keeps corporate-action scaling separate from ordinary decimal formatting.

### Take the plan with you

Copy the full plan or download a CSV containing the mode, asset, verified mint, percentage, exact USDC allocation, available estimate, and quote time. Copy an individual mint and amount when you are ready to review that asset on Jupiter.

The handoff opens Jupiter's official homepage. You select the asset, enter the copied amount, and review current amounts and fees there. Lotline does not assemble, sign, submit, or execute transactions, and does not claim a purchase happened after an external link was opened.

### Start in a minute

Try the clearly labeled Example mode for a complete, deterministic walkthrough without credentials. Example balances and estimates are synthetic; Live mode always uses real services and never substitutes example values for a failed request.

The responsive interface fits mobile, tablet, and desktop screens. Warm paper tones, forest green, legible labels, accessible controls, and tabular amounts keep the contribution plan easy to read. Install Lotline as a web app in a supported browser for a home-screen, dock, or desktop entry. After its offline Example is ready, you can continue the synthetic planning walkthrough without connectivity. Live data and account access require a connection.

### Keep a plan for next time

Guest planning saves your basket on the current device. Optional Supabase accounts let you explicitly save named plans, then load or delete them across devices. Signing in does not upload the current draft. Saved plans contain your chosen assets, percentages, and budget; they do not contain a wallet address, balances, or quote results. Each account can keep up to 20 plans, restricted to that account by database access policies.

Public signup and password recovery depend on configured email delivery. Guest planning stays available when email services are unavailable.

### Built for clear boundaries

Lotline is a contribution calculator. It does not provide investment recommendations, rebalance holdings, calculate portfolio performance, custody assets, or automate trading. Estimates are approximate and may omit future network costs. **Review current amounts and fees on Jupiter before trading.**

The application uses Next.js, TypeScript, React, and Tailwind, with narrow server-side adapters for issuer metadata, Solana RPC, and Jupiter. Supabase provides optional accounts, owner-scoped saved plans, and shared provider request coordination across Vercel instances. Exact allocation math is separately testable. Quote identity, response validation, bounded requests, and explicit failure states support a dependable planning workflow.

[Make a plan](https://lotline-omega.vercel.app/app) · [Try the example](https://lotline-omega.vercel.app/app?mode=example) · [Watch the demo](https://lotline-omega.vercel.app/demo) · [Explore the source](https://github.com/operatoruplift/lotline).

---

## Publication note

The application is a deployed website and installable PWA, with optional account features. It does not ship native App Store or Play Store packages. The launch still requires a custom SMTP sender for unrestricted public signup and recovery email. Do not add claims of investment performance, audited contracts, guaranteed liquidity, organizer endorsement, or completed trading. The repository verification record separates completed checks from pending deployment checks.
