# Lotline technical walkthrough

Target: 2 minutes 40 seconds. Use actual browser and repository captures, readable type, and a calm voiceover. The time budget allows a short pause between concepts. Architecture diagrams may be original SVG or HTML, but operational results must come from the running application.

## 0:00–0:18 — Product boundary

**Show:** Homepage, then the planner.

**Narration:** “Lotline answers one question: how would my next USDC contribution be split across the Solana xStocks I chose, and approximately how many units would I receive? The user chooses up to three assets and their percentages. The application reads balances and requests quotes. It never assembles, signs, or submits a transaction.”

**Caption:** A contribution calculator · Read-only wallet data · Quote-only estimates

## 0:18–0:42 — Exact contribution math

**Show:** Example mode with 10.000001 USDC at 50, 30, and 20 percent. Then show the pure allocation function and its behavioral test.

**Narration:** “Budgets are parsed from strings into BigInt micro-USDC. Percentages become integer basis points totaling ten thousand. Each allocation is floored, and remaining micro-units go to the largest remainders, with stable basket-order ties. So ten point zero zero zero zero zero one splits into five point zero zero zero zero zero one, three, and two. No money passes through binary floating point.”

**Caption:** Exact total: 10.000001 USDC

## 0:42–1:09 — Verified identity and scaled units

**Show:** Original diagram: Issuer metadata → verified Solana mint → all owner token accounts → raw BigInt sum → official scaled-unit conversion. Show the Token-2022 conversion helper and the scheduled-multiplier test.

**Narration:** “The server resolves asset identity from the issuer's official deployments and validates the Solana mint and token program. Wallet lookup enumerates every account for a selected mint and sums raw amounts. xStocks use Token-2022 Scaled UI Amount, so raw units divided by decimals are not enough. The official conversion helper uses mint configuration and chain time. Resulting holdings add raw balance and raw quote output before conversion.”

**Caption:** Convert holdingsRaw + quoteOutRaw using the mint and chain time

## 1:09–1:34 — Quote lifecycle and failure handling

**Show:** A sanitized request diagram with inputMint, outputMint, and amount; no key or RPC URL. Edit a budget so results invalidate. Show an expired or unavailable state from a clearly labeled test fixture.

**Narration:** “Jupiter's order endpoint receives only verified input and output mints and the allocated raw amount. The taker is omitted. The server validates returned identity and amounts and normalizes the result. Quotes expire after at most thirty seconds. Plan changes invalidate them, and obsolete responses cannot overwrite a newer plan. Rate limits, missing configuration, unavailable routes, and unverified scaling produce explicit states.”

**Caption:** No taker · No execute call · No fabricated fallback

## 1:34–1:59 — App architecture and storage

**Show:** Next.js route tree and the actual responsive app. If optional account and PWA configuration is verified, show those real screens; otherwise stay with guest planning and identify deployment work as incomplete.

**Base narration:** “Next.js route handlers keep upstream calls on the server. The browser gets narrow, validated responses. Pure domain functions own allocation, storage schemas, and exports. Guest planning saves basket settings locally without persisting the wallet address. The responsive interface keeps the same planning workflow on mobile and desktop.”

**Optional verified addition:** “Configured Supabase accounts can save plans across devices, with access restricted to the signed-in owner. The installable PWA keeps its shell separate from fresh live market requests.”

Use the optional addition only after those behaviors pass deployment checks. Do not claim App Store or native binary distribution from PWA installation.

## 1:59–2:25 — Evidence

**Show:** Actual test output and a cropped, sanitized live verification record. Clearly distinguish deterministic fixture coverage from observed live requests. Show at least one real quote record without displaying expired numbers as current prices.

**Narration:** “Verification covers budget parsing, rounding, multiple token accounts, scaled multipliers and activation, missing data, failed providers, and stale-response isolation. Browser checks exercise keyboard operation, exports, saved plans, and responsive layouts. A separate live smoke reads official metadata and real chain balances and requests an actual quote without a taker. The verification record preserves the observation time and the live address's confirmed zero-balance limitation.”

**Caption:** Fixture coverage and live observations are recorded separately

Do not hardcode a test count into the film until the final build's verification is complete. If counts change, update the captured terminal and delivery note together.

## 2:25–2:40 — Handoff

**Show:** Copy plan, actual CSV, and the Jupiter homepage link. Finish on Lotline logo and the verified public repository URL.

**Narration:** “The user can copy the plan, download its CSV, and review each asset independently on Jupiter. Lotline cannot observe a completed purchase. The source includes the adapters, tests, setup instructions, and dated integration evidence. No transactions were signed or submitted.”

**Caption:** github.com/operatoruplift/lotline

## Capture notes

- Capture source in a clean editor view without environment files, terminal secrets, provider URLs containing credentials, account emails, or auth tokens.
- Use full-size readable excerpts rather than scrolling through hundreds of lines. Highlight BigInt allocation, official conversion, taker omission, and the stale-request guard.
- Keep Example labels in fixture recordings. Label actual live footage “Live observation — [actual date/time]”; never regenerate a date to make footage look current.
- Use the final repository URL after reviewed source has been pushed. List deployed-service limitations in the media delivery note.
