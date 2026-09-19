# Historical verification record

For the deployed application, CI, hosted database and read-only provider checks, see the [September 20 release record](release-20260920.md). The [September 19 continuation report](finish-report-20260919.md) preserves the preceding local checkpoint. The observations below remain historical.

Verified September 11–12, 2026. The original chain and quote observations retain their September 11 UTC timestamps. See [live integration detail](live-integration.md), the exact [normalized live observations](live-smoke.json), and the separate [production-build UI observation](ui-live-smoke.json).

These are earlier checkpoints. The [Stocklana finish delivery](stocklana-finish-delivery.md) records its local checks and the separate September 12 public-page observation; the current deployed status is in the September 20 record above.

[Deployed website](https://lotlineonsolana.vercel.app) · [Example planner](https://lotlineonsolana.vercel.app/app?mode=example) · [Demo](https://lotlineonsolana.vercel.app/demo) · [Public repository](https://github.com/operatoruplift/lotline)

## September 12 catalog and favicon update

The issuer snapshot now contains **832 Solana tokenized stocks and ETFs**, all verified against initialized Token2022 mints with supported scaling and bundled official 400×400 PNG logos. The live local `/api/assets` endpoint returned all 832 with zero verification exclusions. Four issuer-reported halts remained marked: CITICx, CKAHx, CKHUTx, and JPSTx. See [catalog provenance](xstocks-catalog.md) and [the machine-readable verification record](xstocks-catalog-verification.json).

A read-only live AMZNx quote for 100 USDC returned HTTP 200 and mint-aware units at 09:45:40 UTC. This is a point-in-time route check, not a claim that every listed asset always has liquidity. Quotes separately recheck issuer halt status; bulk catalog loading does not seed or extend that cache.

Plans now support up to 10 assets, with API requests still capped at three assets each. The expanded Supabase allowlist migration `20260912094113_expanded_stock_plans` was applied. Transactional tests passed for ten assets, rejecting eleven, new mints outside the original six, duplicate and unknown mint rejection, account ownership, exact amounts, account limits, and delete isolation. Every test fixture was rolled back.

Browser favicon routes now use the selected branching logo through conventional ICO, SVG, and Apple metadata files. The contribution preview uses aligned content and keeps its status badges outside the card. Layout regression checks cover 320, 375, 768, and 1440 px.

## Completed build checks

- Lint, TypeScript checking, and the Next.js production build passed.
- The deterministic suite plus the final catalog rerun passed **168 tests**. The full 832-asset fixture uses a scoped 60-second test bound after exceeding 15 seconds on a busy development machine; the single opt-in live test remains skipped in ordinary runs and live evidence is recorded separately.
- **38 browser scenarios** passed together against the fresh local production build, including the ten-asset batching/export/persistence journey, the full-catalog mobile search, four-width contribution-card layout regression, the core planner, accessibility, PWA/offline flows, cloud-plan account changes, draft persistence, judge-readiness flows, and strict share-link journeys.
- A secret scan of the tracked source and built-client files found no matches for the configured server-secret values. The public Supabase project URL and publishable key are intentionally exposed; privileged keys remain server-side.

Counts describe the completed checkpoint above. Hosted browser and account-flow checks are recorded separately below as they finish; a passed local test does not imply every deployed integration was exercised.

## Chain and quote integration

The opt-in live adapter smoke passed: six official issuer deployments resolved, their mainnet Token-2022 mints and scaling were decoded, a public issuer-authority address returned confirmed zero AAPLx/USDC holdings, and a real keyless Jupiter quote for 10 USDC returned usable raw output and mint-aware scaled units. The request omitted `taker`. The resulting-unit path converted the raw balance plus quote output. No signatures or transactions were submitted.

The six curated asset identities were rechecked against the official issuer responses on September 12, 2026. Each response supplied the expected underlying ticker and ISIN, a unique Solana deployment, and the matching official 400×400 logo. Those six logo files are bundled under `public/logos/xstocks/` so the planner and offline Example do not depend on an external image request; their issuer source URLs remain visible in the verification receipt.

The live check used a zero-balance public address. Nonzero holdings, multiple accounts for one mint, scheduled multiplier changes, and partial RPC failures are covered by deterministic tests; they are not claimed as observed on that live wallet. Public endpoints may throttle access, and live prices are not permanently guaranteed. The original observation times are preserved in the evidence file.

The separate UI observation exercised actual balances, a real quote, and scaled estimated resulting units through the production-build browser interface, with no browser errors or transaction-execution requests. It is dated evidence, not a permanent quote or a claim about a nonzero wallet balance.

The deployed Vercel site also passed a Live smoke on September 11, 2026, from 17:23:50 to 17:24:04 UTC: six verified assets, confirmed zero AAPLx/USDC holdings, and a real keyless Jupiter quote for 10 USDC. All observed API responses returned HTTP 200. A separate judge audit requested one real no-wallet AAPLx estimate, which returned approximately `+0.02997652` units for `10.000001` USDC; this remains a dated quote, not a guaranteed price. See [deployed Live observations](deployed-live-smoke.json).

## Supabase and deployment

At the initial September 11 hosted checkpoint, the first two migrations were applied: shared provider start-time reservations and owner-restricted contribution plans. The September 12 catalog checkpoint above records the third, expanded-stock-plan migration. Hosted database tests checked grants, row-level isolation, malformed plan rejection, and the 20-plan quota using synthetic fixtures inside a transaction that was rolled back. No test accounts or plans from that SQL transaction were retained.

Auth configuration has been pushed and checked with zero managed differences: the site URL uses the deployed Vercel origin, callback redirects are exact, email confirmation is enabled, and the minimum password length is 12. The Supabase public configuration, server secret, and explicit `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false` readiness flag are set in local configuration and the Vercel development, preview, and production environments. The Git-connected Vercel deployment reached Ready at the linked public URL.

Actual production browser checks passed password sign-in, explicit cloud save, exact plan load, persistence after reload, delete, and sign-out. Real authenticated Data API requests confirmed cross-owner reads/deletes cannot access another user's rows, ownership spoofing is rejected, and anonymous access is denied. Two disposable confirmed users were created without sending emails, then removed with their plan data. See [hosted authentication evidence](hosted-auth-verification.json).

The real local-browser check exposed Next.js normalizing loopback IPs to `localhost`, causing a same-origin save to return 403. The reviewed fix restores only an explicit validated loopback Host with a matching port; arbitrary and forwarded hosts remain untrusted. Focused regression tests cover IPv4, IPv6, hostname substitution, ports, protocols, and callback destinations. Actual account CRUD passed on both the local loopback and deployed production origins. The two cloud-plan race scenarios separately use controlled responses to verify account changes and delayed list requests.

The first GitHub browser run exposed a draft-saving debounce race during immediate reload. Basket edits now persist synchronously. A regression freezes browser timers, edits a restored draft, and reloads before any deferred save can run. A separate blocked-storage scenario confirms calculation and export remain available with explicit storage feedback.

The judge-readiness pass fixed four presentation issues found by testing the public journey: an empty saved Live draft could blank the linked Example, a mobile estimate left the numeric results below the viewport, replacing a full basket required deletion and re-entry, and an asset's verification evidence was hidden. Example entry now falls back to its complete deterministic split unless a shared link is awaiting consent; Get estimates scrolls to the results on narrow screens; assets can be replaced in place; and **Verify this plan** exposes exact allocation, issuer metadata, mint, token program, quote source, retrieval time, and freshness. A share link is reviewed in a dialog and never triggers balances or quotes.

**Remaining email limitation:** a custom SMTP sender is still needed for unrestricted public confirmation and password-reset delivery. Supabase's default email service is restricted. The app retains email confirmation and leaves guest planning available; unrestricted public signup delivery is not claimed.

## PWA coverage

The deployed UI passed 12 page-and-viewport checks across six routes at 375 px and 1440 px, with HTTP 200 responses, no detected accessibility violations, no page errors, and no horizontal overflow. The initial visual pitch cut also played; see the dated [deployed UI verification](deployed-ui-verification.json). The final Ainsley-narrated pitch has 13 speech-aligned caption cues, and the public 160-second technical walkthrough has 12 scene captions. Separate [video verification](video/public-video-verification.json) records playback checks for the delivered files. The final source additionally includes responsive judge-readiness and share-link checks described above.

The installable web app includes standalone metadata, original app icons, platform-specific installation instructions, and safe-area support. Automated checks cover icon dimensions, credential-free public precaching, cache exclusions, failed-refresh preservation, install-prompt handling, and a disconnected reload that calculates and exports the real synthetic Example plan. Live and account data remain online-only.

The deployed PWA was also checked for public-only cache contents, disconnected reload, exact Example allocations, and a downloaded CSV export. These deployed observations are included in the same verification record above.

This is a browser PWA across mobile and desktop. The checks do not claim a physical iPhone installation, native operating-system package, or App Store/Play Store distribution. Service workers are tested against a production build because they are intentionally disabled in development mode.

## Implementation checks

- Exact BigInt budget parsing, basis points, largest-remainder allocation, and tie-breaking.
- All raw token accounts are aggregated; confirmed zero differs from unavailable. Real package encoders build fixtures that exercise the installed official scaling helper before and at activation time.
- Strict request bounds, issuer identity validation, trusted output mints, normalized service errors, missing RPC configuration, optional Jupiter key, no-route failures, and credential-safe errors.
- Versioned local basket storage, including corrupt data and intentionally cleared baskets. Wallet addresses are excluded from local persistence and cloud plans.
- CSV formula-injection protection and actual browser clipboard/download verification.
- Obsolete quote response completion cannot replace a newer budget. Provider expiry and offline states remain visible.
- Optional account requests validate sessions, enforce same-origin writes, and use owner filters and database access policies. Saved plans contain no balances or quote results.
- Shared Supabase provider reservations bound aggregate request starts across Vercel instances; coordination failures produce explicit unavailable states.

Code, TypeScript, and database reviews examined the service adapters, arithmetic, React request lifecycle, account boundaries, input validation, caching, and persistence, including their security behavior. Material findings were fixed and covered by regressions where appropriate. These are implementation reviews, not an independent security certification.

## Running checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The live smoke runs only when explicitly opted in:

```sh
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com LOTLINE_LIVE_SMOKE=1 npx vitest run tests/server-live.test.ts
```

Screenshots in [screenshots](screenshots/) show the running application with Example mode clearly labeled. They are not trading receipts. The [dependency note](dependencies.md) explains package-version compatibility, and the [Stocklana check](stocklana-check.md) distinguishes public information from unverified submission rules.

No transactions were signed or submitted. Publishing the website and source is separate from a hackathon submission; no submission or organizer endorsement is claimed.
