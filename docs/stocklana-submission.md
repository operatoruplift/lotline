# Lotline — Stocklana submission draft

**Last updated:** September 23, 2026. **Status:** draft, not submitted. The application is available at [lotline.dev](https://lotline.dev). [Current implementation and verification](releases/2026-09-23/quote-benchmark.md) separates local checks from production access and settlement limits. Team/contact details still need to be supplied before submission. [Official requirements check](stocklana-check.md)

## Project and team

- **Project:** Lotline
- **Tagline:** Your next contribution, clearly.
- **Team/public name:** Matt Sim
- **Members and roles:** Matt Sim ([@rvaclassic](https://github.com/rvaclassic)), solo founder and developer. Sole author of the design, contribution arithmetic, provider adapters and verification evidence.
- **Submission contact:** Supplied directly in the official form; not published in this repository.
- **Repository/release:** [operatoruplift/lotline](https://github.com/operatoruplift/lotline); [September 23 production evidence](releases/2026-09-23/release.md) and [benchmark follow-up](releases/2026-09-23/quote-benchmark.md).

## Short description

Lotline splits your next USDC contribution across tokenized stocks to the exact micro-unit, reads the Token-2022 multipliers that silently change what a balance displays, and hands you a plan you can save, share and review on Jupiter.

## The user and problem

Our target user already knows their xStocks and percentages. Each new USDC contribution requires exact amounts, useful unit estimates and a split they can reuse. Lotline completes that task with a saved/exported plan and an independent trade-review handoff. Percentages apply to the contribution, not portfolio targets; the user chooses every allocation.

**Size of the surface, as reported by third parties.** These are public ecosystem figures, not Lotline metrics, and Lotline has no traction of its own to report. Tokenized equity holders on Solana passed 800,000 across six issuing platforms, and xStocks alone reported over $3 billion in cumulative on-chain volume with roughly 57,000 holders and about 93% of tokenized stock volume as of January 2026. Every one of those holders who contributes more than once faces the arithmetic this tool performs, and the catalog carries 832 verified mints rather than the handful a manual process can track.

## What works

**The part nothing else in this category does.** Every allocation is computed in integer micro-USDC and basis points, so the whole budget is accounted for with no rounding drift: **10.000001 USDC at 50/30/20 becomes 5.000001 / 3.000000 / 2.000000**, and that exact amount survives into the CSV and into the prefilled Jupiter link. Token-2022 Scaled UI Amount conversion uses the official helper against chain time, so a corporate-action multiplier that changes a displayed balance without any transfer is reflected rather than silently absorbed. Raw holdings and quoted output are summed before formatting, never added as rounded strings. A spreadsheet cannot verify a mint, a multiplier, or when a quote expired.

Start without registration or a wallet extension. Choose up to ten reviewed assets, set percentages and enter USDC. Request estimates, inspect **Verify this plan**, copy/export, and return to the device draft with a different budget. Public-wallet holdings are optional. Existing account users can explicitly save/load/delete named plans; signing in never uploads the draft. Share links require review before replacing it.

The responsive PWA's Example includes all 832 snapshot assets. Original six practice rates are preserved; extra assets use generic one-unit-per-100-USDC estimates and zero illustrative holdings, never live prices. The design preserves Lotline's identity, product previews, original decorative media and bounded glass refraction beneath native forms.

## Why Solana matters

Issuer metadata establishes identity and halt status. Solana supplies mint configuration, raw balances and chain time. Official Token-2022 Scaled UI Amount conversion respects corporate-action multipliers: raw holdings and quoted output are added before formatting. Confirmed zero stays distinct from unavailable.

Jupiter supplies amount-specific, quote-only estimates. Results expire within 30 seconds or earlier provider expiry and invalidate on edits. A spreadsheet alone cannot verify those chain facts and routes. The user opens the exact mint and USDC amount prefilled on official Jupiter, then independently reviews the current route and fees there. In-app execution remains disabled pending authenticated provider access and restricted participant configuration; the implemented validator has passed a real unsigned mainnet simulation; fixture receipts are not real purchases.

## Evidence and limits

[Local redesign evidence](redesign-delivery.md) and [finish-pass evidence](stocklana-finish-delivery.md) separate fixture/browser checks from real read-only provider observations. The [deployment record](deployment.md) identifies the later public release and its verification. [Integration history](integration-verification.md) and [account evidence](hosted-auth-verification.json) retain earlier hosted checks. The September 12 catalog snapshot contains 832 verified mints, without guaranteeing liquidity.

Signup/recovery await verified SMTP delivery. Optional Tokens.xyz context awaits approved access. Provider errors remain visible. No native app-store package or audited-contract claim is made. User demand remains unvalidated; no interviews, traction or feedback are invented. [Human test guide](usability-test-guide.md)

## Links to include

- [Public source](https://github.com/operatoruplift/lotline)
- [Live website](https://lotline.dev)
- [Interactive Example](https://lotline.dev/app?mode=example)
- [Demo page with captions and transcripts](https://lotline.dev/demo)
- [Preserved September 12 narrated product film](https://lotline.dev/videos/release-20260912/product.mp4)
- [Preserved September 12 narrated technical film](https://lotline.dev/videos/release-20260912/technical.mp4)
- [Current transcripts, captions and production evidence](video-release.md)
- [Optional 115-second live presentation script](stocklana-demo-script.md) — a separate recording/presentation outline, not the transcript or duration of the current product film
- [Execution walkthrough script](execution-demo-script.md) — staged review, receipt recovery and manual reminder flow; live signing requires separate authorization

The preserved September 12 films use dated captures of the redesigned application, ten-asset plan limit, expanded Example catalog and Ainsley narration generated through Higgsfield. Their Example values are synthetic. The September 11 films and source records remain clearly labeled archives; use the current links above for judging.

## Original work and attribution

Lotline code is [MIT licensed](../LICENSE), with AI-assisted implementation and testing. Dependencies include Next.js/React, TypeScript, Tailwind, Solana Kit/Token-2022, Supabase, Zod and Lucide, under their respective licenses. [Catalog provenance](xstocks-catalog.md) attributes issuer logos and identities.

The custom design follows L1 Kova, L4 Veloce, L5 Heritage Grove and L6 Liquid Glass references. User-supplied footage is documented in the [media manifest](design-media-manifest.json); provenance is not a blanket media license. Current films combine real application recordings with Ainsley narration generated through Higgsfield; [source, credits and verification](video-release.md) distinguish this production from the archival Higgsedit films. No provider endorsement is implied.

## Current completion evidence

See the [September 23 release](releases/2026-09-23/release.md) and [benchmark follow-up](releases/2026-09-23/quote-benchmark.md) for implementation, hosted checks and remaining production prerequisites. The September 20 contribution release and [September 19 finish report](finish-report-20260919.md) preserve earlier evidence. Team names/contact remain owner-supplied fields; no submission has been sent.

Current first-use and technical evidence recordings are on the demo page, labeled controlled rehearsal. [Current short/full description](lotline-description.md).

## September 23 sponsor scope

The separate [PreStocks planner](https://lotline.dev/pre-ipo) uses eight issuer identities checked against mainnet, exact contribution arithmetic, read-only Jupiter estimates, isolated local drafts, universe-tagged share links and exports. The current transfer-fee extensions are outside the purchase validator; unsupported nonzero wallet account formats remain unavailable. No PreStocks purchase is claimed.

On September 23, production returned eight verified PreStocks assets and eight successful 10-USDC read-only estimates. Those observations demonstrate discovery and estimation, not purchase settlement.

The xStocks review implements pinned Pyth equity and token references for AAPLx, MSFTx and NVDAx. A planning benchmark compares USDC input converted to USD against the quote's scaled share exposure and the underlying equity reference, with original price times and confidence. It expires with its inputs and does not represent the later executable order or an all-in cost. The token-feed ratio remains context only. Fresh mapped equity/token observations are checked throughout purchase review and before dispatch. Production lacks the Pyth API key, so authenticated live delivery and a live benchmark remain unverified.

PreStocks and Pyth are the additional sponsor targets. Tessera, Clawpump and Meteora DBC are not implemented or claimed. The official PreStocks bounty excludes non-PreStocks pre-IPO token integrations. Real settlement still awaits provider credentials, reviewed participant access and separate wallet authorization. [Current implementation and evidence](releases/2026-09-23/quote-benchmark.md).
