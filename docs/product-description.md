# Lotline — product descriptions

**Last updated:** September 16, 2026.

## Short description

Lotline turns your next USDC contribution into an exact xStocks split, fresh unit estimates, and a plan you can save and review on Jupiter.

## Full description

# Lotline

**Your next contribution, clearly.**

You know which assets you want to contribute to. The next question is practical: how should this USDC contribution be split, and approximately how many units would it add?

Lotline brings that calculation into one focused workspace. Search the reviewed issuer catalog by company or ticker. Its September 12, 2026 snapshot contains 832 Solana stocks and ETFs with official logos; that count does not guarantee a trading route. Choose up to 10 issuer-verified xStocks, set your own percentages, enter a USDC budget, and explicitly request unit estimates. Optionally add a public wallet address to see current holdings alongside estimated contribution and resulting units. Then copy the plan, download a CSV, or open Jupiter to independently review a trade.

### Your contribution, your choices

A device draft keeps your chosen assets, percentages, and budget ready for the next visit. Change the amount and request new estimates without rebuilding the split. The percentages apply to the new contribution. Lotline does not choose an allocation for you or treat those percentages as targets for your existing portfolio.

A 10.000001 USDC contribution split 50/30/20 becomes exactly 5.000001, 3.000000, and 2.000000 USDC. Every micro-USDC is accounted for with integer arithmetic, including amounts that do not divide evenly.

### Real holdings, clear estimates

Wallet lookup is read-only. Paste a public Solana address to load the selected xStock balances and mainnet USDC without a wallet extension or signature. Lotline distinguishes a confirmed zero balance from data that could not be loaded.

Asset identity comes from the issuer's official metadata and is checked against the deployed Solana mint. Estimates come from Jupiter's amount-specific, quote-only endpoint in batches of at most three. Each result retains its original retrieval time, becomes stale after at most 30 seconds or earlier provider expiry, and clears when the plan changes. Finishing a later batch cannot renew earlier estimates. An unavailable route or service appears as an honest unavailable state. **Verify this plan** exposes the exact arithmetic, mint/program, sources and freshness.

Solana xStocks use Token-2022 Scaled UI Amount. Lotline uses the official mint-aware conversion path and chain time to display units. For estimated resulting holdings, it adds raw current units to raw quote output before conversion. This keeps corporate-action scaling separate from ordinary decimal formatting.

### Take the plan with you

Copy the full plan or download a CSV containing the mode, asset, verified mint, percentage, exact USDC allocation, available estimate, and quote time. Copy an individual mint and amount when you are ready to review that asset on Jupiter.

The handoff opens Jupiter's official homepage. You select the asset, enter the copied amount, and review current amounts and fees there. Lotline does not assemble, sign, submit, or execute transactions, and does not claim a purchase happened after an external link was opened.

### Start in a minute

Try the clearly labeled Example mode for a complete, deterministic walkthrough without credentials. Example covers all 832 snapshot identities. Its original six synthetic rate/balance examples are preserved; the extra 826 use zero illustrative holdings and a generic one-unit-per-100-USDC rate. None of these practice values is a live price, wallet balance, route or halt check. Live mode uses real services and never substitutes Example values for a failed request.

The responsive interface fits mobile, tablet, and desktop screens. Warm paper tones, forest green, legible labels, accessible controls, and tabular amounts keep the contribution plan easy to read. Install Lotline as a web app in a supported browser for a home-screen, dock, or desktop entry. After its offline Example is ready, you can continue the synthetic planning walkthrough without connectivity. Live data and account access require a connection.

### Keep a plan for next time

Guest planning saves your basket on the current device. Optional Supabase accounts let you explicitly save named plans, then load or delete them across devices. Signing in does not upload the current draft. Saved plans contain your chosen assets, percentages, and budget; they do not contain a wallet address, balances, or quote results. Each account can keep up to 20 plans, restricted to that account by database access policies.

Public signup and password recovery stay gated until confirmation and recovery delivery are verified. Existing users can sign in when Supabase is configured, and guest planning remains complete. An editable device draft, an explicitly saved named plan, and an expiring quote are separate things.

Optional **Load asset context** can show supplementary exact-mint context from Tokens.xyz after approved API access is configured. It is currently disabled and is never required for asset selection, calculation, estimates or saving.

### Built for clear boundaries

Lotline is a contribution calculator. It does not provide investment recommendations, rebalance holdings, calculate portfolio performance, custody assets, or automate trading. Estimates are approximate and may omit future network costs. **Review current amounts and fees on Jupiter before trading.**

The application uses Next.js, TypeScript, React, and Tailwind, with narrow server-side adapters for issuer metadata, Solana RPC, and Jupiter. Supabase provides optional accounts, owner-scoped saved plans, and shared provider request coordination across Vercel instances. Exact allocation math is separately testable. Quote identity, response validation, bounded requests, and explicit failure states support a dependable planning workflow.

[Make a plan](https://lotlineonsolana.vercel.app/app) · [Try the example](https://lotlineonsolana.vercel.app/app?mode=example) · [Watch the demo](https://lotlineonsolana.vercel.app/demo) · [Explore the source](https://github.com/operatoruplift/lotline).

---

## Publication note

The selected redesign, expanded Example, continuous visible motion treatment and refreshed narrated films are deployed at [lotlineonsolana.vercel.app](https://lotlineonsolana.vercel.app). The current production deployment is `dpl_9FSoQKHERwL3qzL8BADFgZfiTK1P` and is ready. The [current product and technical films](video-release.md) use fresh application captures and Higgsfield-generated Ainsley narration, with synthetic Example values and separately dated Live observations disclosed. Both films passed hosted mobile and desktop playback, audio, seeking, caption and accessibility checks. No native App Store or Play Store package is shipped. Public account email, authenticated Tokens.xyz enrichment and live execution remain externally gated. See [local redesign evidence](redesign-delivery.md) and the [submission draft](stocklana-submission.md); do not claim user feedback, investment performance, guaranteed liquidity, organizer endorsement or executed trades.
