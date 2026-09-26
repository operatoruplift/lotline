# Lotline

> **In 20 seconds.** Lotline plans a USDC contribution across issuer-verified xStocks and pre-IPO PreStocks with exact splits, read-only Jupiter estimates and Pyth references, and can execute the plan on-chain when the operator turns execution on. Try it without a wallet: [lotline.dev/app?mode=example](https://lotline.dev/app?mode=example). Built by Matt ([RVAClassic](https://x.com/operatoruplift), Operator Uplift) for the Solana Foundation **Stocklana** sprint and the Solana Mobile **CLOCK IN** hackathon, September 2026. Real today: exact math, mainnet mint verification, installable PWA, Seeker Android shell, Mobile Wallet Adapter, and live reads from PreStocks, Pyth and Meteora. Lotline is a calculation and routing layer: it plans the contribution and hands you an exact, prefilled Jupiter link to review and approve in your own wallet. Everything below is verification detail; nothing claims traction or audits that have not happened.

**Your next contribution, clearly.** Choose up to 10 issuer-verified Solana xStocks, set your contribution percentages, enter a USDC budget, and request estimated units. Keep the split for next time, or copy/export the plan for independent review on Jupiter. A public-wallet balance read is optional.

[Live website](https://lotline.dev) · [Try the example](https://lotline.dev/app?mode=example) · [Demo](https://lotline.dev/demo) · [Public source](https://github.com/operatoruplift/lotline)

**September 21 sponsor update:** a separate [PreStocks planner](https://lotline.dev/pre-ipo) adds eight issuer-identified pre-IPO assets with mainnet mint verification, exact allocation, read-only Jupiter estimates, local drafts and universe-tagged share/export. PreStocks purchases are not enabled; transfer-fee/confidential token balances remain unavailable when their account semantics are unsupported. The xStocks review also implements independent Pyth references for AAPLx, MSFTx and NVDAx. Current Pyth prices require a server API key; no authenticated live-price delivery is claimed until that configuration is verified. See [sponsor release evidence](docs/sponsor-release-20260921.md).

Lotline serves someone who already knows their chosen assets and split and wants to repeat a contribution accurately. Percentages apply to the new contribution, not target weights for an existing portfolio. Planning and Example mode are read-only. A staged Wallet Standard/Jupiter execution path is present but remains paused until its server readiness gates, durable journal, and reconciliation checks are deliberately enabled. Guest planning needs no registration or wallet extension. Existing Supabase users can explicitly save named plans across devices; public signup and recovery remain gated until SMTP delivery is verified.

**September 20 contribution update:** first-use planning, typed provider errors, observed token scaling, semantic Jupiter/Raydium transaction validation, immutable ALT receipts and current demonstration footage are implemented. All seven Supabase migrations are applied and checked. A real unsigned mainnet order passed the validator and simulation; no trade was signed or broadcast. Purchases happen in your own wallet on Jupiter, which is the boundary this release is built around. See the [current contribution release](docs/contribution-release-20260920.md) for exact local/hosted/CI evidence, supported-route limits and deployment revision. The original design, films, brand kit and ten-asset exact math are preserved. No competition entry has been submitted.

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
| `PYTH_API_KEY` | Server only | Hermes has required a key on every host since 2026-08-26. With it, equity/token USD references for the three pinned mappings come from `https://hermes.pyth.network` and USDC/USD is cross-checked on-chain; without it, USDC/USD is read keyless from Pyth's receiver account on Solana mainnet through `SOLANA_RPC_URL`. |
| `PYTH_HERMES_URL` | Server only, optional | https origin override for the Hermes host (routes are appended). A keyless request is only sent to an explicit override. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public, build time | Hosted Supabase URL for accounts and shared provider coordination. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public, build time | Current `sb_publishable_` key for optional authentication and owner-scoped cloud plans. |
| `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` | Public, build time | Set to the exact string `true` only after testing custom SMTP signup and recovery delivery. The launch deployment uses `false`; existing users can still sign in. |
| `SUPABASE_SECRET_KEY` | Server only | Current `sb_secret_` key for shared provider request coordination; required on Vercel. Account and cloud-plan paths do not use this privileged key. |
| `LOTLINE_SHARED_LIMITS` | Server only | Set to `true` to require the shared limiter locally. Vercel requires it automatically. |
| `LOTLINE_EXECUTION_ENABLED`, `LOTLINE_EXECUTION_MIGRATIONS_READY`, `LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY`, `LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY`, `LOTLINE_EXECUTION_REPOSITORY`, `LOTLINE_EXECUTION_VALIDATOR_READY`, `LOTLINE_EXECUTION_PROOF_MIGRATIONS_READY`, `LOTLINE_EXECUTION_ACCESS_POLICY`, `LOTLINE_EXECUTION_ALLOWED_WALLETS` | Server only | Execution safety gates for a deployment that runs the in-app order path. That path turns on once journal migrations, server secret, Jupiter key, RPC, supported-instruction review and reconciliation checks are all in place; see [execution readiness](docs/execution.md). |
| `TOKENS_XYZ_ENABLED`, `TOKENS_XYZ_API_KEY` | Server only | Optional exact-mint context. A deployment with approved `assets:read` access enables it with the exact flag `true`; see [contract and activation requirements](docs/tokens-enrichment.md). |

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

## Ecosystem integrations

Three Solana data integrations sit beside the planner. Each one reads, labels what it read and when, and never routes a purchase.

### PreStocks: pre-IPO identity and estimates

The separate [PreStocks planner](https://lotline.dev/pre-ipo) plans across eight pre-IPO assets: Anduril, Anthropic, Figure AI, Kalshi, Neuralink, OpenAI, Polymarket and SpaceX. Those eight identities are pinned in `lib/domain/prestocks.ts`, and every catalog load re-confirms each one against the live PreStocks API, comparing name, contract address, image and issuer link before the asset is offered. Each mint is then verified on Solana mainnet as a Token-2022 mint with the Scaled UI Amount extension, and re-read immediately before every quote so a paused mint or a changed metadata pointer stops the estimate rather than silently pricing a different token. Estimates come from the same read-only Jupiter order endpoint the xStocks planner uses, with no taker and nothing signed. Adding a newly listed PreStocks asset means editing that pinned list and re-running the mainnet verification, which is why the registry is a deliberate allowlist rather than whatever the API happens to return. The server routes are under `app/api/prestocks/`.

### Pyth: price context for an estimate

For AAPLx, MSFTx and NVDAx, Lotline reads the pinned equity and token feeds plus USDC/USD and shows them beside the Jupiter estimate, so a planner can see the reference price behind a quote. Reads come from Pyth Hermes at `https://hermes.pyth.network`, and every Hermes host has required a Pyth API key since 26 August 2026, so the equity references, the feed-price ratio and the purchase-review gate run on `PYTH_API_KEY` from a Pyth Terminal account.

Independently of any key, Lotline reads USDC/USD straight from Pyth's sponsored price account on Solana mainnet through its own verified-mainnet RPC. It derives the account address from the push-oracle program and the feed id, then requires the receiver program as owner, the expected account discriminator, a full verification tag and a matching feed id before exposing the price. Every observation carries a provenance label saying which of the two paths it came from, and freshness is always measured from Pyth's own publish time, so a cached response can never make a price look newer than it is. Feed identities are checked against Pyth's official MCP server using its keyless `get_symbols` tool; `scripts/verify-pyth-feeds.mjs` runs that check on demand and all seven pinned ids matched on 26 September 2026. The code is `lib/server/pyth.ts` and `lib/server/pyth-onchain.ts`.

### Meteora: where your asset prices other tokens

Meteora's Dynamic Bonding Curve program lists tokenized stocks as **quote** tokens rather than as assets for sale: 737 of the 832 xStocks hold a DBC token badge, and launch pools price a newly created token in that xStock. Lotline reads that relationship directly for a selected asset. It checks the token badge account, finds the curve configs that quote in the asset, opens their pools, and computes an estimate with the official SDK's pure quote function at one confirmed slot, reporting curve progress against the migration threshold, reserves and the exact fee the curve charged. Because a curve's price moves with every swap, each figure is labelled with the pool it came from and the slot it was read at.

Two things this is not. It is not a way to buy an xStock, since a USDC to xStock route runs through Jupiter and no bonding curve sells the xStock itself. And it is not a write path: Lotline never creates a pool, signs, or routes a purchase through DBC. PreStocks tokens carry no DBC badge and are planned from issuer identity data with Jupiter estimates. The code is `lib/domain/dbc.ts`, `lib/server/meteora-dbc.ts` and the panel in `components/dbc-pairs.tsx`.

## Precision and freshness

- Budgets use plain decimal strings with up to six fractional digits, bounded to 1,000,000 USDC. Allocation uses BigInt micro-units and integer basis points, then distributes leftover micro-units by largest remainder with stable basket-order ties.
- Token accounts are enumerated by owner and mint. All valid raw amounts are summed. Confirmed zero and unavailable holdings are distinct.
- Token-2022 Scaled UI Amount conversion uses the installed official helper and chain time. Resulting units convert `holdingsRaw + quoteOutRaw`; rounded UI strings are never added. Unsupported scaling is labeled unavailable.
- Estimates expire after at most 30 seconds, sooner when the provider supplies an earlier expiry. Cached estimates retain their retrieval time. Plan edits invalidate results and obsolete requests cannot overwrite the edited plan.
- Copied plans and CSVs preserve original quote times and include effective expiry, source, export time, and an explicit fresh/stale/unavailable state. Exporting never refreshes a quote.
- Issuer halt status suspends estimates for that asset. It is not a claim about DEX market hours or liquidity.
- Estimates are not guaranteed. Future network costs can be omitted from quote-only responses. **Review current amounts and fees on Jupiter.** Insufficient current USDC is informational and does not prevent planning a future contribution.

## Storage and services

Guest basket settings, budget, and the manual review cadence are saved in versioned localStorage on the current browser/device, with safe recovery from corrupt values. Supabase handles optional email/password authentication and session cookies. An explicit cloud save stores a plan name, verified mints, basis-point weights, and exact budget under the signed-in owner. Wallet addresses, balances, quotes, and projections are excluded. The database enforces owner access with forced row-level security, validates plan content, and limits each account to 20 plans. Users can load or delete their saved plans. See [accounts](docs/accounts.md) and [privacy and storage](https://lotline.dev/privacy).

Live provider requests use narrow same-origin handlers; authentication uses the official Supabase browser client. Server adapters validate issuer, Solana RPC, and Jupiter response data and expose normalized fields. RPC URLs, API keys, and raw provider errors are not returned. Catalog caching is approximately one hour; holdings approximately 15 seconds; identical quotes only briefly within freshness. Requests have timeouts, queue bounds, and a user-driven retry path.

Optional **Load asset context** uses Tokens.xyz through a server adapter on a deployment with approved API access. It is purely additional: asset eligibility, allocation, balances, unit conversion and quote freshness never depend on it, so a plan is complete with or without it.

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
- [Downloadable Lotline brand kit](https://lotline.dev/brand-kit) with profiles, wallpapers, social art, ads, backgrounds, headers, and SVG marks
- [Pitch production and archival editable source](docs/video/README.md)
- [Technical walkthrough and archival source](docs/technical-video.md)
- [Historical deployed screenshots](docs/screenshots/); current local screenshot/capture paths are recorded in [redesign delivery](docs/redesign-delivery.md)

## Attribution

Lotline application code is [MIT licensed](LICENSE). It uses Next.js/React, TypeScript, Tailwind, Solana Kit and official Token-2022 helpers, Supabase, Zod and Lucide; exact versions are in `package-lock.json`. Third-party libraries retain their licenses. Issuer logos identify xStocks and PreStocks; attribution is in the [xStocks catalog record](docs/xstocks-catalog.md) and [PreStocks integration record](docs/releases/2026-09-21/prestocks-integration.md). The selected template references guided the custom Next.js composition; user-supplied decorative media and their derivatives are documented in the [media manifest](docs/design-media-manifest.json). The pitch uses Higgsfield/Higgsedit and its documented Ainsley narration. Media provenance is not a blanket third-party redistribution license; preserve provider attribution and applicable rights when reusing those assets.

## Structure

- `app/`: website, planner, demo, authentication, privacy, offline page, and narrow API routes.
- `components/`: responsive planner, account controls, installation UI, and shared visual components.
- `lib/domain/`: pure exact math, plan identity, bounded share-link encoding, storage schema, text/CSV exports.
- `lib/server/`: verified catalog, read-only Solana data, quote-only Jupiter adapter, and shared provider limits.
- `lib/server/execution/`: the opt-in Jupiter order boundary, exact signed-message and receipt checks, a narrow Jupiter route_v2/Raydium CLMM semantic validator, and Supabase journal adapter.
- `lib/supabase/`: public/browser and server clients plus cloud-plan validation.
- `supabase/`: versioned migrations and database isolation verification.
- `lib/demo/`: visibly synthetic Example fixtures.
- `public/`: service worker, original Lotline logo assets, downloadable brand kit, bundled official xStocks logos, and PWA icons.
- `tests/`: behavioral domain, service, and browser verification.
- `docs/`: dated evidence, screenshots, setup details, product descriptions, design direction, and video materials.

## September 19 local continuation

The [finish report](docs/finish-report-20260919.md) records additional wallet, recovery, receipt and manual-reminder fixes against `b843014`. That historical checkpoint is superseded by the September 20 release: the migrations and narrow semantic validator are implemented and checked. Production offers read-only planning and the official Jupiter handoff, so every purchase is reviewed and approved in the planner's own wallet.

## Seeker, Android and PWA

Lotline installs as a PWA and ships an Android WebView shell (`android/`) for the Solana Seeker and dApp Store, with Solana Mobile Wallet Adapter support where the app connects a wallet. Build, test and publishing steps: [docs/seeker-and-pwa.md](docs/seeker-and-pwa.md).
