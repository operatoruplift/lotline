# Lotline

**A clear plan for your next xStocks contribution.** Choose up to 10 issuer-verified Solana xStocks, set your contribution percentages, enter a USDC budget, and request estimated units. Optionally read a public wallet's balances, then copy or export the plan for independent review on Jupiter.

[Live website](https://lotlineonsolana.vercel.app) · [Try the example](https://lotlineonsolana.vercel.app/app?mode=example) · [Demo](https://lotlineonsolana.vercel.app/demo) · [Public source](https://github.com/operatoruplift/lotline)

Lotline is a contribution calculator. It does not recommend allocations, rebalance holdings, value portfolios, custody funds, construct transactions, request signatures, or submit trades. Guest planning is available without an account. Optional Supabase accounts support named plans across devices when email delivery is configured; the launch deployment keeps new signup and recovery forms gated until its SMTP sender is verified.

## Run locally

Use Node.js 22 or newer and npm. Builds have been exercised with Node 22.19 and Node 24.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Choose **Try the example** for the complete experience with no credentials. Example balances and outputs are deterministic synthetic fixtures, including a non-unit multiplier; mint identities were obtained from the issuer.

For Live mode or optional accounts, copy the environment template and fill in the needed values:

```sh
cp .env.example .env.local
npm run dev
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

Never put a privileged key or credential-bearing RPC URL in a public variable. `.env.local` is ignored by Git. Public RPC and Jupiter endpoints may throttle requests.

Missing configuration or failed upstream calls produce explicit unavailable states. Live never substitutes Example values. A wallet extension is not required; enter a public Solana address or plan without one. Addresses are not persisted in browser storage or saved cloud plans.

## Use it

Search **832 issuer-listed Solana stocks and ETFs** by company or ticker, with bundled official logos and verified mint identities. Choose up to 10 per plan. Live estimates arrive in batches of three; every estimate retains its original timestamp. Catalog inclusion does not guarantee an available trading route. See [catalog provenance and refresh instructions](docs/xstocks-catalog.md).

1. Select one to 10 assets, set percentages totaling exactly 100%, and enter a budget.
2. Optionally load a public wallet's selected-token and USDC balances.
3. Choose **Get estimates**. The results show exact USDC allocation, estimated received units, and estimated resulting units when balances are available.
4. Copy the plan or download its CSV. To review a trade independently, copy the mint and exact USDC amount, open Jupiter, select that asset, and enter the amount there.
5. Optionally sign in and choose **Save this plan** to keep a named plan across devices. Signing in alone does not upload the current draft. New signup and recovery email forms appear only after `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` is set following a real SMTP delivery test.

You can also choose **Split evenly** for a deterministic equal distribution, replace an asset without rebuilding the basket, or use **Copy plan link**. A link carries only the mode, budget, verified-mint choices, and percentages in a URL fragment. The recipient reviews it in a dialog before applying it; wallet addresses, balances, quotes, and account data never enter the link.

The external link opens only `https://jup.ag/`. Lotline cannot observe or confirm a purchase. A later holdings reload is a fresh wallet read, not evidence of a specific trade.

## Precision and freshness

- Budgets use plain decimal strings with up to six fractional digits, bounded to 1,000,000 USDC. Allocation uses BigInt micro-units and integer basis points, then distributes leftover micro-units by largest remainder with stable basket-order ties.
- Token accounts are enumerated by owner and mint. All valid raw amounts are summed. Confirmed zero and unavailable holdings are distinct.
- Token-2022 Scaled UI Amount conversion uses the installed official helper and chain time. Resulting units convert `holdingsRaw + quoteOutRaw`; rounded UI strings are never added. Unsupported scaling is labeled unavailable.
- Estimates expire after at most 30 seconds, sooner when the provider supplies an earlier expiry. Cached estimates retain their retrieval time. Plan edits invalidate results and obsolete requests cannot overwrite the edited plan.
- Issuer halt status suspends estimates for that asset. It is not a claim about DEX market hours or liquidity.
- Estimates are not guaranteed. Future network costs can be omitted from quote-only responses. **Review current amounts and fees on Jupiter.** Insufficient current USDC is informational and does not prevent planning a future contribution.

## Storage and services

Guest basket settings and budget are saved in versioned localStorage on the current browser/device, with safe recovery from corrupt values. Supabase handles optional email/password authentication and session cookies. An explicit cloud save stores a plan name, verified mints, basis-point weights, and exact budget under the signed-in owner. Wallet addresses, balances, quotes, and projections are excluded. The database enforces owner access with forced row-level security, validates plan content, and limits each account to 20 plans. Users can load or delete their saved plans. See [accounts](docs/accounts.md) and [privacy and storage](https://lotlineonsolana.vercel.app/privacy).

Browser calls go only to narrow same-origin handlers. Server adapters validate issuer, Solana RPC, and Jupiter response data and expose normalized fields. RPC URLs, API keys, and raw provider errors are not returned. Catalog caching is approximately one hour; holdings approximately 15 seconds; identical quotes only briefly within freshness. Requests have timeouts, queue bounds, and a user-driven retry path.

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

Tests cover exact math, storage and export safety, multiple token accounts, scaling activation, provider failures, account boundaries, shared request coordination, and PWA cache behavior. Browser checks exercise planning, exports, persistence, keyboard interaction, responsive sizes, and late-response isolation. The database verification in `supabase/tests/plans_rls.sql` uses synthetic fixtures inside a rolled-back transaction. See [integration verification](docs/integration-verification.md) for dated live checks and remaining limitations, and [the demo script](docs/demo-script.md) for a 90-second walk-through.

The type-check command generates Next.js route types before running TypeScript, so it also works from a clean checkout.

## Supabase and Vercel deployment

The hosted Supabase project and Git-connected Vercel project are configured, all three database migrations have been applied, and required Supabase public and secret values are set in development, preview, and production environments. The live site is linked above. See the [deployment configuration](docs/deployment.md) and [integration verification](docs/integration-verification.md) for dated checks and remaining limitations. The launch `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false` flag makes the signup and recovery state explicit to judges while preserving existing-user sign-in and owner-scoped cloud plans.

For a separate deployment:

1. Create a Supabase project and apply both versioned migrations in `supabase/migrations/`. With the Supabase CLI, link your project and run `supabase db push`.
2. Enable email/password authentication with confirmation and a minimum password length of 12. Set the correct site origin and allow its `/auth/callback` and `/auth/callback?next=/auth/update-password` redirects. Preserve existing settings when sharing a project.
3. Configure a custom SMTP sender for public signup and password-reset delivery. Supabase's default SMTP is restricted; unrestricted delivery has not been established for this launch. Email verification stays enabled, guest planning remains available, and only after a real confirmation and recovery delivery test should you set `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` and rebuild.
4. Import the repository into Vercel with the Next.js preset and Node 22 or newer. Set the variables above in every intended environment before building; public Supabase values must exist at build time.
5. Deploy, then check Example, Live data, sign-in, saved-plan isolation, and production PWA behavior using that deployment's actual configuration.

A static export is not supported because Live and account features need server routes. A self-hosted Node deployment can use `npm ci`, `npm run build`, and `npm run start`. Multiple instances should enable shared provider coordination.

No hackathon submission is claimed. The [Stocklana check](docs/stocklana-check.md) records currently visible official information without assuming judging criteria or organizer approval.

## Product materials

- [Short and full Markdown descriptions](docs/product-description.md)
- [MotionSites component recommendations and Dribbble references](docs/design-direction.md)
- [Higgsfield pitch video, editable source, and delivery record](docs/video/README.md)
- [Technical walkthrough and source](docs/technical-video.md)
- [Screenshots of the deployed mobile and desktop experience](docs/screenshots/)

## Structure

- `app/`: website, planner, demo, authentication, privacy, offline page, and narrow API routes.
- `components/`: responsive planner, account controls, installation UI, and shared visual components.
- `lib/domain/`: pure exact math, plan identity, bounded share-link encoding, storage schema, text/CSV exports.
- `lib/server/`: verified catalog, read-only Solana data, quote-only Jupiter adapter, and shared provider limits.
- `lib/supabase/`: public/browser and server clients plus cloud-plan validation.
- `supabase/`: versioned migrations and database isolation verification.
- `lib/demo/`: visibly synthetic Example fixtures.
- `public/`: service worker, original Lotline logo assets, bundled official xStocks logos, and PWA icons.
- `tests/`: behavioral domain, service, and browser verification.
- `docs/`: dated evidence, screenshots, setup details, product descriptions, design direction, and video materials.
