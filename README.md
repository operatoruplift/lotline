# Lotline

**Your next contribution, clearly.** Choose up to 10 issuer-verified Solana xStocks, set your contribution percentages, enter a USDC budget, and request estimated units. Keep the split for next time, or copy/export the plan for independent review on Jupiter. A public-wallet balance read is optional.

[Live website](https://lotlineonsolana.vercel.app) · [Try the example](https://lotlineonsolana.vercel.app/app?mode=example) · [Demo](https://lotlineonsolana.vercel.app/demo) · [Public source](https://github.com/operatoruplift/lotline)

Lotline serves someone who already knows their chosen assets and split and wants to repeat a contribution accurately. Percentages apply to the new contribution, not target weights for an existing portfolio. Planning and Example mode are read-only. A staged Wallet Standard/Jupiter execution path is present but remains paused until its server readiness gates, durable journal, and reconciliation checks are deliberately enabled. Guest planning needs no registration or wallet extension. Existing Supabase users can explicitly save named plans across devices; public signup and recovery remain gated until SMTP delivery is verified.

**September 20 release:** the contribution recovery, downloadable receipts, manual reminder sync and new clearly labeled controlled demonstration are packaged for production. All six Supabase migrations are applied, and production flags keep purchases disabled while allowing configured receipt reconciliation. The 832-identity Example, selected L1/L4/L5/L6 design, brand kit and narrated planner films are preserved. See the [current deployment record](docs/deployment.md) and [September 20 release evidence](docs/release-20260920.md) for hosted status. In-app mainnet purchases still require the missing encoded swap validator, Jupiter credentials and issuer access policy; a test recording does not prove a real purchase. No competition submission or funded transaction has been made.

## Run locally

Use Node.js 22 or newer and npm. Builds have been exercised with Node 22.19 and Node 24.

```sh
npm ci
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run dev -- --port 3111
```

Open [127.0.0.1:3111](http://127.0.0.1:3111). Choose **Try the example** for the complete experience with no credentials. Local Example includes all **832 reviewed snapshot identities**. The six original walkthrough assets retain their synthetic balances/rates and non-unit scaling examples; the additional **826** use zero illustrative holdings and a deliberately generic **one unit per 100 USDC**. These are practice values, never live prices, routes, balances or halt checks.

For Live mode or optional accounts, create `.env.local` from the template only if you do not already have one, then fill in the needed values:

```sh
cp -n .env.example .env.local
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run dev -- --port 3111
```

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `SOLANA_RPC_URL` | Server only | Required for live mint validation, wallet balances, and scaled units. The example supplies public mainnet RPC; a dedicated provider is preferable for shared use. |
| `JUPITER_API_KEY` | Server only | Optional while documented keyless access remains supported. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public, build time | Hosted Supabase URL for accounts and shared provider coordination. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public, build time | Current `sb_publishable_` key for optional authentication and owner-scoped cloud plans. |
| `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` | Public, build time | Set to the exact string `true` only after testing custom SMTP signup and recovery delivery. The launch deployment uses `false`; existing users can still sign in. |
| `SUPABASE_SECRET_KEY` | Server only | Current `sb_secret_` key for shared provider request coordination; required on Vercel. Account and cloud-plan paths do not use this privileged key. |
| `LOTLINE_SHARED_LIMITS` | Server only | Set to `true` to require the shared limiter locally. Vercel requires it automatically. |
| `LOTLINE_EXECUTION_ENABLED`, `LOTLINE_EXECUTION_MIGRATIONS_READY`, `LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY`, `LOTLINE_EXECUTION_REPOSITORY`, `LOTLINE_EXECUTION_VALIDATOR_READY` | Server only | Execution safety gates. Keep execution disabled until all journal migrations, server secret, Jupiter key, RPC, supported-instruction review and production reconciliation checks are complete; see [execution readiness](docs/execution.md). |
| `TOKENS_XYZ_ENABLED`, `TOKENS_XYZ_API_KEY` | Server only | Optional exact-mint context, disabled by default. Requires approved `assets:read` access and the exact flag `true`; see [contract and activation requirements](docs/tokens-enrichment.md). |

Never put a privileged key or credential-bearing RPC URL in a public variable. `.env.local` is ignored by Git. Public RPC and Jupiter endpoints may throttle requests.

Missing configuration or failed upstream calls produce explicit unavailable states. Live never substitutes Example values. A wallet extension is not required; enter a public Solana address or plan without one. Addresses are not persisted in browser storage or saved cloud plans.

## Use it

The pinned issuer snapshot contains **832 Solana stocks and ETFs**, verified on September 12, 2026 at 09:35 UTC. Search by company or ticker, with official logos and reviewed mint identities. Choose up to 10 per plan. Live estimates arrive in batches of three; every estimate retains its original timestamp. This dated catalog count is not a claim of current liquidity. See [catalog provenance and refresh instructions](docs/xstocks-catalog.md).

1. Select one to 10 assets, set percentages totaling exactly 100%, and enter a budget.
2. Optionally load a public wallet's selected-token and USDC balances.
3. Choose **Get estimates**. The results show exact USDC allocation, estimated received units, and estimated resulting units when balances are available.
4. Copy the plan or download its CSV. To review a trade independently, open the official Jupiter swap page with the selected mint and exact USDC amount prefilled. Live execution remains behind an explicit readiness gate; Example never signs or submits.
5. Return to the saved device draft, change the contribution amount, and request new estimates. Optionally sign in and choose **Save this plan** to keep a separate named plan across devices. Signing in alone does not upload the draft.

You can also choose **Split evenly** for a deterministic equal distribution, replace an asset without rebuilding the basket, or use **Copy plan link**. A link carries only the mode, budget, verified-mint choices, and percentages in a URL fragment. The recipient reviews it in a dialog before applying it; wallet addresses, balances, quotes, and account data never enter the link.

The external link opens the official `https://jup.ag/swap/` route with the selected mint and exact amount prefilled. Lotline cannot observe or confirm a purchase. A later holdings reload is a fresh wallet read, not evidence of a specific trade.

For a quick precision check, set **10.000001 USDC** at **50/30/20**. The exact allocations are **5.000001 / 3.000000 / 2.000000 USDC**. **Verify this plan** exposes the arithmetic, issuer/mint sources, and quote freshness. A device draft is editable input; a named cloud plan is an explicitly saved copy; an estimate expires and must be requested again.

## Precision and freshness

- Budgets use plain decimal strings with up to six fractional digits, bounded to 1,000,000 USDC. Allocation uses BigInt micro-units and integer basis points, then distributes leftover micro-units by largest remainder with stable basket-order ties.
- Token accounts are enumerated by owner and mint. All valid raw amounts are summed. Confirmed zero and unavailable holdings are distinct.
- Token-2022 Scaled UI Amount conversion uses the installed official helper and chain time. Resulting units convert `holdingsRaw + quoteOutRaw`; rounded UI strings are never added. Unsupported scaling is labeled unavailable.
- Estimates expire after at most 30 seconds, sooner when the provider supplies an earlier expiry. Cached estimates retain their retrieval time. Plan edits invalidate results and obsolete requests cannot overwrite the edited plan.
- Copied plans and CSVs preserve original quote times and include effective expiry, source, export time, and an explicit fresh/stale/unavailable state. Exporting never refreshes a quote.
- Issuer halt status suspends estimates for that asset. It is not a claim about DEX market hours or liquidity.
- Estimates are not guaranteed. Future network costs can be omitted from quote-only responses. **Review current amounts and fees on Jupiter.** Insufficient current USDC is informational and does not prevent planning a future contribution.

## Storage and services

Guest basket settings, budget, and the manual review cadence are saved in versioned localStorage on the current browser/device, with safe recovery from corrupt values. Supabase handles optional email/password authentication and session cookies. An explicit cloud save stores a plan name, verified mints, basis-point weights, and exact budget under the signed-in owner. Wallet addresses, balances, quotes, and projections are excluded. The database enforces owner access with forced row-level security, validates plan content, and limits each account to 20 plans. Users can load or delete their saved plans. See [accounts](docs/accounts.md) and [privacy and storage](https://lotlineonsolana.vercel.app/privacy).

Live provider requests use narrow same-origin handlers; authentication uses the official Supabase browser client. Server adapters validate issuer, Solana RPC, and Jupiter response data and expose normalized fields. RPC URLs, API keys, and raw provider errors are not returned. Catalog caching is approximately one hour; holdings approximately 15 seconds; identical quotes only briefly within freshness. Requests have timeouts, queue bounds, and a user-driven retry path.

Optional **Load asset context** uses Tokens.xyz through a server adapter. It is disabled pending approved API access and does not affect asset eligibility, allocation, balances, unit conversion, or quote freshness. Missing context never blocks a contribution plan.

The Supabase-backed limiter reserves upstream start times across Vercel instances: Jupiter requests are spaced by at least 2.1 seconds and Solana requests by 150 milliseconds. Its bounded backlog rejects excess work instead of growing indefinitely. The table contains provider timing only, with no wallet or account data. A single local process also uses bounded in-process queues. Other applications using the same upstream key or IP can still consume provider allowances.

## Mobile, desktop, and offline use

Lotline is a responsive, installable Progressive Web App. Supported browsers can add it to the home screen, dock, or desktop with a standalone window. This delivers one web application across mobile, tablet, and desktop; no native App Store or Play Store package is claimed.

After the app reports **Example is ready to use offline**, disconnected public-page navigation opens the synthetic Example planner. Exact allocation, local drafts, Example estimates, and CSV export continue to work. Live data, authentication, and cloud plans require connectivity. API responses, account pages, authentication flows, and private plans are excluded from the service-worker cache. See [installation and offline behavior](docs/pwa.md).

## Verify

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests cover exact math, storage and export safety, multiple token accounts, scaling activation, provider failures, account boundaries, shared request coordination, and PWA cache behavior. Browser checks exercise planning, exports, immediate-reload persistence, keyboard interaction, responsive sizes, account-switch isolation, reduced motion, video playback, and actual glass refraction. The database verification in `supabase/tests/plans_rls.sql` uses synthetic fixtures inside a rolled-back transaction. See [integration history](docs/integration-verification.md), [local redesign checks](docs/redesign-delivery.md), and the [115-second submission demo script](docs/stocklana-demo-script.md). Fixture tests are not live-provider evidence.

The type-check command generates Next.js route types before running TypeScript, so it also works from a clean checkout.

## Supabase and Vercel deployment

September 11–12 deployment records describe a configured Supabase project, Git-connected Vercel project, and all three migrations applied across the initial and catalog-expansion checkpoints. Those historical records alone do not establish the latest public release or revalidate its credentials. See [deployment configuration and evidence](docs/deployment.md) for the current release and its actual checks. `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false` keeps unavailable email flows explicit while preserving existing-user sign-in and owner-scoped cloud plans.

For a separate deployment:

1. In an authorized target Supabase project, apply the four base migrations in timestamp order: shared provider limits, contribution plans, expanded stock plans, then the execution journal and manual-schedule tables. If guest execution is intended, apply the additive `20260915090000_guest_execution_owner_index.sql` migration as a fifth step, then `20260919090000_execution_integrity.sql` for per-run attempt locking and receipt retention, and set `LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY=true` only after its quota, retention and rate-limit functions are checked. With the Supabase CLI, link that project and run `supabase db push`.
2. Enable email/password authentication with confirmation and a minimum password length of 12. Set the correct site origin and allow its `/auth/callback` and `/auth/callback?next=/auth/update-password` redirects. Preserve existing settings when sharing a project.
3. Configure a custom SMTP sender for public signup and password-reset delivery. Supabase's default SMTP is restricted; unrestricted delivery has not been established for this launch. Email verification stays enabled, guest planning remains available, and only after a real confirmation and recovery delivery test should you set `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` and rebuild.
4. Import the repository into Vercel with the Next.js preset and Node 22 or newer. Set the variables above in every intended environment before building; public Supabase values must exist at build time.
5. Deploy, then check Example, Live data, sign-in, saved-plan isolation, and production PWA behavior using that deployment's actual configuration.

A static export is not supported because Live and account features need server routes. A self-hosted Node deployment can use `npm ci`, `npm run build`, and `npm run start`. Multiple instances should enable shared provider coordination.

Deployment was authorized after the local finish checkpoint. The [deployment record](docs/deployment.md) distinguishes that release from historical observations and records the checks actually performed. The [Stocklana check](docs/stocklana-check.md) records the official deadline and judging instructions rechecked on September 12; the [submission draft](docs/stocklana-submission.md) remains ready for team details and review. No event submission has been made.

## Product materials

- [Short and full Markdown descriptions](docs/product-description.md)
- [Stocklana submission draft](docs/stocklana-submission.md), [timed demo script](docs/stocklana-demo-script.md), and [human usability-test guide](docs/usability-test-guide.md)
- [MotionSites component recommendations and Dribbble references](docs/design-direction.md)
- [Implemented selected redesign](docs/redesign-delivery.md) and [exact media provenance](docs/design-media.md)
- [Current product and technical films, Ainsley narration, captions and transcripts](docs/video-release.md)
- [Downloadable Lotline brand kit](https://lotlineonsolana.vercel.app/brand-kit) with profiles, wallpapers, social art, ads, backgrounds, headers, and SVG marks
- [Pitch production and archival editable source](docs/video/README.md)
- [Technical walkthrough and archival source](docs/technical-video.md)
- [Historical deployed screenshots](docs/screenshots/); current local screenshot/capture paths are recorded in [redesign delivery](docs/redesign-delivery.md)

## Attribution

Lotline application code is [MIT licensed](LICENSE). It uses Next.js/React, TypeScript, Tailwind, Solana Kit and official Token-2022 helpers, Supabase, Zod and Lucide; exact versions are in `package-lock.json`. Third-party libraries retain their licenses. Issuer logos identify xStocks and are attributed in the [catalog record](docs/xstocks-catalog.md). The selected template references guided the custom Next.js composition; user-supplied decorative media and their derivatives are documented in the [media manifest](docs/design-media-manifest.json). The pitch uses Higgsfield/Higgsedit and its documented Ainsley narration. Media provenance is not a blanket third-party redistribution license; preserve provider attribution and applicable rights when reusing those assets.

## Structure

- `app/`: website, planner, demo, authentication, privacy, offline page, and narrow API routes.
- `components/`: responsive planner, account controls, installation UI, and shared visual components.
- `lib/domain/`: pure exact math, plan identity, bounded share-link encoding, storage schema, text/CSV exports.
- `lib/server/`: verified catalog, read-only Solana data, quote-only Jupiter adapter, and shared provider limits.
- `lib/server/execution/`: disabled-by-default Jupiter order/execute boundary, exact signed-message/receipt checks, a blocked swap-instruction validator, and Supabase journal adapter.
- `lib/supabase/`: public/browser and server clients plus cloud-plan validation.
- `supabase/`: versioned migrations and database isolation verification.
- `lib/demo/`: visibly synthetic Example fixtures.
- `public/`: service worker, original Lotline logo assets, downloadable brand kit, bundled official xStocks logos, and PWA icons.
- `tests/`: behavioral domain, service, and browser verification.
- `docs/`: dated evidence, screenshots, setup details, product descriptions, design direction, and video materials.

## September 19 local continuation

The [finish report](docs/finish-report-20260919.md) records additional wallet, recovery, receipt and manual-reminder fixes against `b843014`. That report records the local checkpoint before the separately authorized September 20 release; both pending migrations are now applied. In-app execution remains blocked by missing encoded swap validation in addition to external configuration; production continues to offer read-only planning and the official Jupiter handoff.
