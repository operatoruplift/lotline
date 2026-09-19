# Lotline — Stocklana submission draft

**Last updated:** September 19, 2026. **Status:** draft, not submitted. The redesigned application, expanded Example and current narrated films are deployed at [lotlineonsolana.vercel.app](https://lotlineonsolana.vercel.app). The [release verification](release-verification.md) identifies the production deployment and checks actually performed. Team/contact details and the reviewed source reference still need to be supplied before submission. [Official requirements check](stocklana-check.md)

## Project and team

- **Project:** Lotline
- **Tagline:** Your next contribution, clearly.
- **Team/public name:** [Team to confirm]
- **Members and roles:** [Names, roles and profile links to confirm]
- **Submission contact:** [Team to supply directly in the official form]
- **Repository/release:** [Confirm the reviewed commit or release intended for judging]

## Short description

Lotline turns your next USDC contribution into an exact xStocks split, fresh unit estimates, and a plan you can save and review on Jupiter.

## The user and problem

Our target user already knows their xStocks and percentages. Each new USDC contribution requires exact amounts, useful unit estimates and a split they can reuse. Lotline completes that task with a saved/exported plan and an independent trade-review handoff. Percentages apply to the contribution, not portfolio targets; the user chooses every allocation.

## What works

Start without registration or a wallet extension. Choose up to ten reviewed assets, set percentages and enter USDC. Exact integer arithmetic accounts for the whole budget: **10.000001 at 50/30/20 becomes 5.000001 / 3.000000 / 2.000000**.

Request estimates, inspect **Verify this plan**, copy/export, and return to the device draft with a different budget. Public-wallet holdings are optional. Existing account users can explicitly save/load/delete named plans; signing in never uploads the draft. Share links require review before replacing it.

The responsive PWA's Example includes all 832 snapshot assets. Original six practice rates are preserved; extra assets use generic one-unit-per-100-USDC estimates and zero illustrative holdings, never live prices. The design preserves Lotline's identity, product previews, original decorative media and bounded glass refraction beneath native forms.

## Why Solana matters

Issuer metadata establishes identity and halt status. Solana supplies mint configuration, raw balances and chain time. Official Token-2022 Scaled UI Amount conversion respects corporate-action multipliers: raw holdings and quoted output are added before formatting. Confirmed zero stays distinct from unavailable.

Jupiter supplies amount-specific, quote-only estimates. Results expire within 30 seconds or earlier provider expiry and invalidate on edits. A spreadsheet alone cannot verify those chain facts and routes. The user opens the exact mint and USDC amount prefilled on official Jupiter, then independently reviews the current route and fees there. In-app execution remains disabled pending current swap-instruction validation and service configuration; fixture receipts are not real purchases.

## Evidence and limits

[Local redesign evidence](redesign-delivery.md) and [finish-pass evidence](stocklana-finish-delivery.md) separate fixture/browser checks from real read-only provider observations. The [deployment record](deployment.md) identifies the later public release and its verification. [Integration history](integration-verification.md) and [account evidence](hosted-auth-verification.json) retain earlier hosted checks. The September 12 catalog snapshot contains 832 verified mints, without guaranteeing liquidity.

Signup/recovery await verified SMTP delivery. Optional Tokens.xyz context awaits approved access. Provider errors remain visible. No native app-store package or audited-contract claim is made. User demand remains unvalidated; no interviews, traction or feedback are invented. [Human test guide](usability-test-guide.md)

## Links to include

- [Public source](https://github.com/operatoruplift/lotline)
- [Live website](https://lotlineonsolana.vercel.app)
- [Interactive Example](https://lotlineonsolana.vercel.app/app?mode=example)
- [Demo page with captions and transcripts](https://lotlineonsolana.vercel.app/demo)
- [Current narrated product film](https://lotlineonsolana.vercel.app/videos/release-20260912/product.mp4)
- [Current narrated technical film](https://lotlineonsolana.vercel.app/videos/release-20260912/technical.mp4)
- [Current transcripts, captions and production evidence](video-release.md)
- [Optional 115-second live presentation script](stocklana-demo-script.md) — a separate recording/presentation outline, not the transcript or duration of the current product film
- [Execution walkthrough script](execution-demo-script.md) — staged review, receipt recovery and manual reminder flow; live signing requires separate authorization

The preserved September 12 films use dated captures of the redesigned application, ten-asset plan limit, expanded Example catalog and Ainsley narration generated through Higgsfield. Their Example values are synthetic. The September 11 films and source records remain clearly labeled archives; use the current links above for judging.

## Original work and attribution

Lotline code is [MIT licensed](../LICENSE), with AI-assisted implementation and testing. Dependencies include Next.js/React, TypeScript, Tailwind, Solana Kit/Token-2022, Supabase, Zod and Lucide, under their respective licenses. [Catalog provenance](xstocks-catalog.md) attributes issuer logos and identities.

The custom design follows L1 Kova, L4 Veloce, L5 Heritage Grove and L6 Liquid Glass references. User-supplied footage is documented in the [media manifest](design-media-manifest.json); provenance is not a blanket media license. Current films combine real application recordings with Ainsley narration generated through Higgsfield; [source, credits and verification](video-release.md) distinguish this production from the archival Higgsedit films. No provider endorsement is implied.

## Current completion evidence

See the [September 19 finish report](finish-report-20260919.md) for the reviewed local implementation, exact tests, production observation and outstanding execution requirements. Team names/contact and a final release reference remain owner-supplied fields; no submission has been sent.
