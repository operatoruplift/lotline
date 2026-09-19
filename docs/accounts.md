# Accounts and cloud plans

Accounts are optional. Guests can use Example and Live, keep a local draft, and export plans. Signing in does not upload the current draft. A plan enters Supabase only when the user chooses **Save this plan**.

This document describes current source behavior. The redesign and contribution finish work are deployed in application release `bae159d`; see the [September 20 release record](release-20260920.md). Hosted account observations below retain their original dates and origins; this release did not repeat the real two-user account test or send email. Public signup and recovery remain gated, while existing-account sign-in is available when Supabase is configured.

## Configuration

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at build time. The key must be a current `sb_publishable_` key. The public client deliberately rejects secret and legacy service-role keys. No privileged key is used for auth or cloud-plan requests.

For an authorized new database, apply the account and catalog migrations in `supabase/migrations/` in timestamp order:

1. `20260911170809_shared_provider_limits.sql`: server-only provider request coordination.
2. `20260911170815_contribution_plans.sql`: `public.lotline_contribution_plans` and helpers in the non-exposed `lotline_private` schema.
3. `20260912094113_expanded_stock_plans.sql`: expanded issuer allowlist and up to ten assets per plan.

The account API needs explicit SELECT, INSERT, and DELETE grants for the authenticated role; the plan migrations supply them together with forced row-level security. There is no UPDATE permission. Existing unrelated table grants are preserved. Shared provider coordination uses a separate privileged server credential; account and plan requests use the user's verified session. The execution journal and schedule migration (`20260914090000_execution_journal.sql`) adds service-role journal access plus owner-scoped authenticated schedule policies. The guest-owner index/quota migration (`20260915090000_guest_execution_owner_index.sql`) and attempt-integrity migration (`20260919090000_execution_integrity.sql`) were applied during the authorized September 20 release; all six versions match the linked project. Purchases remain disabled because transaction validation and external execution readiness are incomplete.

Enable email/password authentication and keep email confirmation enabled. Add the deployed origin’s `/auth/callback` and `/auth/callback?next=/auth/update-password` to the Auth redirect allowlist. Add equivalent local URLs only for development. On a shared project preserve the existing Site URL and existing allowlist entries. Set `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` only after a custom SMTP sender has delivered both a confirmation and a recovery message. Until then, `/sign-up` and `/auth/reset-password` deliberately explain that guest planning is ready while existing-user sign-in remains available.

Supabase’s default SMTP service is limited and is not a substitute for a production email provider. Configure a real custom SMTP sender for unrestricted public signup and password-reset delivery. If sending fails, Lotline reports the failure and leaves guest planning available. It does not bypass email verification. No OAuth provider is advertised before it is configured.

## Flow

- `/sign-up` registers an email and password and requests confirmation using PKCE.
- `/auth/callback` exchanges the authorization code for a cookie session. Its redirect destination is allowlisted to `/app` or `/auth/update-password`.
- `/sign-in` verifies email/password. `/auth/reset-password` requests a recovery email; `/auth/update-password` requires an authenticated session before submitting a new password.
- `/api/auth/session` and `/api/plans` use writable route-handler cookies and `auth.getUser()` to verify identity against Supabase. Server Components do not read auth cookies, so no global auth proxy is needed.
- Sign-out clears the current browser session. Cross-tab sign-out and account changes immediately clear loaded private plan names and invalidate pending responses before loading another account.

The browser Supabase client uses the official `@supabase/ssr` cookie integration. Both public credentials are intended for browser use. Responses containing account or cloud-plan data are `no-store`; state-changing plan requests also require a same-origin browser request.

Current account handlers guard unmounts, mode changes and duplicate submits. A single shared SDK client serializes explicit account operations. Canceled mutation responses are bounded and checked through body decoding before the SDK can persist session cookies; old SDK cleanup completes before a newer account operation. Explicit recovery verification and sign-out share that ordering. Background reads and token refresh keep their independent timeout. A late account-A response cannot overwrite account B, and no stale sign-out is used as a cleanup shortcut. Cloud API 401 responses clear private state immediately, including when their error body is not JSON.

Next.js normalizes loopback IP URLs to `localhost`. Lotline restores the actual local cookie origin only when the incoming Host is an explicit loopback host with the same protocol and port. Remote hosts and forwarded-host headers cannot widen the origin check. The same bounded rule preserves local email-callback redirect hosts.

## Stored data

Each row contains the authenticated user ID, a generated plan ID, a name, exact integer micro-USDC as text, up to ten issuer-confirmed mint IDs with basis-point weights as text, and a creation timestamp. The database checks canonical decimal strings, the maximum budget of 1,000,000 USDC, mint allowlisting, unique assets, and weights totaling 10,000 basis points. Wallet addresses, token balances, quotes, and projections are never uploaded to this table.

Each account can keep 20 plans. A per-user transaction lock serializes the count check. Read and delete policies require `auth.uid() = user_id`; create also requires ownership. Application queries add the owner filter as a second check. A loaded plan gets fresh quotes only when the user asks for them; cloud storage never makes an old quote look current.

## Verification

`npx vitest run tests/supabase-plans.test.ts tests/supabase-api.test.ts` exercises exact round trips, bad money strings, forbidden fields, unsupported mints, duplicate weights, missing sessions, cross-origin writes, owner spoofing, database filters, sanitized account responses, and callback redirects.

`tests/e2e/cloud-plans.spec.ts` verifies account changes, held refreshes and expired-session responses. `tests/auth-transport.test.ts` uses the real Supabase SSR SDK with synthetic network responses and cookie storage to exercise delayed sign-in headers/bodies, password updates, recovery cleanup and sign-out ordering. `tests/e2e/auth-lifecycle.spec.ts` checks navigation cancellation, browser cookies, the visible account identity and duplicate-submit recovery. These are controlled fixtures, not evidence of current hosted auth or delivered email.

`supabase/tests/plans_rls.sql` is a database verification script intended to run as an administrator against a development project. It creates synthetic users and rows in a transaction, checks grants and cross-user isolation, exercises database input checks and the 20-plan limit, then rolls every fixture back. It sends no email. Running unit tests alone does not establish that a deployed database has the migration or policies applied; run the SQL verification after deployment too.

### Historical hosted verification — September 11, 2026

[Hosted auth evidence](hosted-auth-verification.json), timestamped `2026-09-11T17:37:33.458Z`, records successful real browser journeys on the local production build at `127.0.0.1:3103` and the then-deployed origin `https://lotline-omega.vercel.app`, both using the hosted Supabase project. The checks covered password sign-in, an exact 1,000-USDC three-asset save, loading that draft, persistence after reload, deletion, sign-out, and denied access after sign-out. Three assets describe that test case, not the current ten-asset limit. Independent authenticated REST requests verified cross-owner read, insert, and delete restrictions; anonymous access and extra wallet metadata were rejected. API checks also rejected owner spoofing and cross-origin mutation requests. No browser errors or transaction requests were observed. The current public alias is [lotlineonsolana.vercel.app](https://lotlineonsolana.vercel.app); it is not substituted into the original evidence.

The same two disposable test users were used for both origins, then deleted with their rows removed through the owner foreign key. Credentials were kept in memory and excluded from public artifacts. The users were confirmed through the admin API, so this test sent no emails and does **not** establish signup-confirmation or recovery-email delivery. A configured production SMTP sender remains necessary for unrestricted public email flows.

The September 12 catalog checkpoint records the expanded ten-asset allowlist migration and rolled-back database verification in [integration history](integration-verification.md). The later [local redesign checkpoint](redesign-delivery.md) includes the SDK cancellation and cloud-expiry repairs described above. Its mocked checks do not repeat the hosted two-user test or establish email delivery. A completed refresh cannot overwrite a newly saved or deleted plan because mutations remain disabled until it settles.

## Primary references

- [Supabase SSR client and cookie integration](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Password authentication and recovery](https://supabase.com/docs/guides/auth/passwords)
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Explicit Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Free-tier email template restrictions](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
