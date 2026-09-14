# Deployment status and history

Updated September 14, 2026 after the execution-path release. **The selected redesign, 832-asset Example, contribution fixes, refreshed narrated films, downloadable brand kit and gated execution routes are deployed.** The [release verification](release-verification.md) records the exact application deployment, fresh hosted provider smoke, video identity and browser evidence. The execution feature release is represented by Vercel deployment `dpl_9hpdApXXDWCKgk3AkaeYEWmJ5pDL`, built from source including feature commit `c1819b0`, and is aliased to both production domains. Earlier observations below retain their historical dates; account/email checks are not implied by the new public release.

- Production website: https://lotlineonsolana.vercel.app
- Interactive Example: https://lotlineonsolana.vercel.app/app?mode=example
- Demo and pitch: https://lotlineonsolana.vercel.app/demo
- Public source: https://github.com/operatoruplift/lotline
- Vercel project: `lotline`, connected to the public source repository, Next.js framework, Node 22, `npm ci` installation.
- Dedicated Supabase project recorded by the earlier setup: `uemunksopacicpbjubtg`, named Lotline, region `us-east-1`. No project, billing or production configuration changes are part of the current task.

The execution journal migration (`20260914090000_execution_journal.sql`) is present in source but remains pending on the linked Supabase project. The deployed readiness endpoint is therefore intentionally `503 configuration-required`; no wallet prompt or transaction can be created. A production check at `2026-09-14T16:56:53Z` returned HTTP 200 for `/`, `/app?mode=example`, `/brand-kit` and `/demo`, HTTP 200 for the favicon and manifest, and HTTP 503 for `/api/execution/config` with only capability reasons. See [execution readiness](execution.md) for the deliberate enablement gates.

## Evidence boundaries

| Capability | Evidence class | Record and limit |
| --- | --- | --- |
| Ten-asset plans, exact allocation, exports, local drafts, share consent, PWA | Implemented; verified locally at prior checkpoints | [Integration history](integration-verification.md) and [redesign delivery](redesign-delivery.md); fixture checks do not establish live data |
| Selected homepage/footer/media and real account refraction; SDK/401 repairs | Implemented; verified locally | Redesign checkpoint: 226 unit checks, one opt-in live test skipped, 60 production-browser tests; this is a dated checkpoint, not the current finish-pass total |
| Real issuer/mint checks, public-wallet read, amount-specific Jupiter quote | Historically verified hosted | [September 11 deployed smoke](deployed-live-smoke.json); the original observation used six assets, not the current catalog size |
| Expanded issuer catalog and ten-asset database allowlist | Historically verified | [September 12 catalog record](xstocks-catalog-verification.json) and integration history: 832 verified mints, expanded migration and rolled-back database checks |
| All 832 snapshot assets available in Example | Implemented and verified locally | Original six synthetic rates preserved; extra 826 use generic one-unit-per-100-USDC estimates and zero illustrative holdings; [finish-pass results](stocklana-finish-delivery.md) are recorded separately |
| Real password sign-in, cloud CRUD and cross-owner RLS | Historically verified hosted | [September 11 auth evidence](hosted-auth-verification.json), on the original `lotline-omega.vercel.app` alias; disposable users were deleted, no email sent |
| Public homepage, Example and updated films | Currently verified hosted | September 12, 16:25–16:27 UTC: current design/logo, 832 Example assets, both narrated films, HTTP 200 and zero overflow/page errors; see [release verification](release-verification.md) |
| Finished application on the public origin | Deployed and verified | Production release created September 12 at 16:19:43 UTC; real hosted catalog, holdings, quote and scaled units passed at 16:22 UTC |
| Public signup/recovery email; authenticated Tokens.xyz context | Externally blocked | Verified custom SMTP delivery; separately, approved Tokens API access, credentials and activation terms |
| Downloadable brand kit | Deployed and verified | `/brand-kit` has 19 visual exports, individual same-origin downloads, a full ZIP and a usage guide; production checks passed for the route, ZIP, profile, phone wallpaper, X header, forest background and guide |

## Earlier hosted observation — September 12, 12:51 UTC

At `2026-09-12T12:51:10.145Z`, read-only inspection of `https://lotlineonsolana.vercel.app` returned homepage HTTP 200 with the earlier heading, “A clear plan for your next xStocks contribution.” The page contained zero `data-design="kova"` markers. Its Example had the original three selected assets and three unselected choices (TSLAx, SPYx and QQQx), for six total, although its plan-size control already allowed ten. No browser errors were observed.

The local Example now reuses all 832 reviewed identities. Its extra 826 assets use zero illustrative balances and a generic one-unit-per-100-USDC rate; that expansion is synthetic usability coverage, not new market evidence. The original six examples are preserved.

This observation made **no sign-in, quote request, plan save or transaction**. It establishes current public-page behavior and the deployment difference only. The sanitized workspace artifact is `work/stocklana-finish/hosted-observation.json`, outside the repository. Earlier hosted auth and Live observations remain separate below.

## Environment

The September 11–12 setup records list `SOLANA_RPC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false`, and server-only `SUPABASE_SECRET_KEY` in Vercel production, preview and development environments. Treat this as configuration history, not a fresh inspection of secret values. Local configuration is in ignored `.env.local`; `.env.example` contains names and placeholders. Never overwrite an existing local environment file or copy server secrets into public variables.

`JUPITER_API_KEY` was absent during the historical successful keyless Vercel smoke. Public Solana mainnet RPC also passed then. Either upstream can throttle or become unavailable. Shared Postgres coordination is required automatically on Vercel and bounds request starts across instances; it does not reserve upstream capacity. The local redesign smoke explicitly disabled shared coordination and therefore did not verify the deployed multi-instance limiter.

Optional Tokens.xyz context remains disabled unless both `TOKENS_XYZ_ENABLED=true` and server-only `TOKENS_XYZ_API_KEY` are configured. Approved `assets:read` access, applicable display terms and key-specific quotas must be established before public activation. Its implementation and missing activation requirements are in [tokens-enrichment.md](tokens-enrichment.md).

## Supabase

The repository contains four migrations. The first three were applied in timestamp order on the earlier authorized target; the execution journal is a separate pending migration:

1. `20260911163835_shared_provider_limits.sql`
2. `20260911163838_contribution_plans.sql`
3. `20260912094113_expanded_stock_plans.sql`
4. `20260914090000_execution_journal.sql` (pending; keep execution disabled until reviewed and applied)

The initial hosted checkpoint applied the first two; the September 12 catalog checkpoint records the third. Historical database checks verified ownership, grants, invalid input, the 20-plan limit, ten assets and deletion with rolled-back fixtures. Provider-slot SQL was checked separately for spacing and bounded backlog. Its table deliberately has RLS with no browser policy or grant; only the privileged server role reserves slots. Current source supports ten plan assets while request batches remain limited to three. This task has not rerun privileged hosted SQL or changed migrations.

`supabase/config.toml` manages the Lotline Auth settings: Site URL, exact production/local callback URLs, minimum password length 12, and required email confirmation. The earlier post-push comparison reported zero managed differences. Preview URLs are not wildcard-allowlisted. Before a future authorized release, verify the actual intended origin and callbacks without replacing unrelated shared-project settings.

The earlier security advisor's informational no-policy notice referred to the deliberately browser-inaccessible quota table; it was not a permission bypass. Those advisor observations are historical, not a fresh security certification.

## Email delivery remains to configure

Existing-account sign-in and hosted password sessions were verified historically. New signup and recovery forms stay gated by `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false` until real confirmation and password-reset delivery are verified. Configure an authorized custom SMTP provider and verified sending domain; keep email confirmation enabled. The earlier admin-confirmed test users bypassed email delivery only for testing and do not prove public signup works. Do not enable the public flag based on fixtures or provider configuration alone.

Configure the provider under Supabase Authentication → Email → SMTP with its host, port, username, password, From address, and sender name. Keep those credentials out of source control and browser environment variables. Follow the provider's DNS verification requirements, then test confirmation and recovery through the production origin.

## Local preview and future release

Node 22+ and npm are required. For a local preview that cannot reserve production provider slots, use the existing configuration with explicit local overrides:

```sh
npm ci
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run dev -- --port 3111
```

For service-worker verification, run `npm run build` and `npm run start` sequentially under the same local overrides, rather than running a build concurrently with a development server using the same generated files. Open `http://127.0.0.1:3111`. The overrides do not disable public Supabase configuration; intercept auth for fixture tests and do not send actual emails or create accounts as part of a guest smoke.

A future authorized application release must publish the reviewed source, validate required environment variables and migration state, wait for its Vercel build, and recheck that exact deployed version: Example/returning draft/export, real read-only Live, account isolation where authorized, media and public-only offline behavior. The September 14 brand-kit release did not change Supabase, Vercel environment variables, migrations, authentication behavior or video files. See [accounts](accounts.md), [PWA behavior](pwa.md), and [submission preparation](stocklana-submission.md).

References: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls).
