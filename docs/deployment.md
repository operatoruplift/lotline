# Hosted deployment

Verified September 12, 2026 (Asia/Ho_Chi_Minh; evidence timestamps use UTC).

- Production website: https://lotline-omega.vercel.app
- Interactive Example: https://lotline-omega.vercel.app/app?mode=example
- Demo and pitch: https://lotline-omega.vercel.app/demo
- Public source: https://github.com/operatoruplift/lotline
- Vercel project: `lotline`, connected to the public source repository, Next.js framework, Node 22, `npm ci` installation.
- Dedicated Supabase project: `uemunksopacicpbjubtg`, named Lotline, region `us-east-1`, in operatoruplift's Org. Provisioned after the user approved the tool's $10/month project quote.

## Environment

Production, preview, and development environments contain `SOLANA_RPC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false`, and server-only `SUPABASE_SECRET_KEY`. Local equivalents are in ignored `.env.local`. `.env.example` contains placeholders. Vercel configuration and authentication files are ignored by Git. No server secret was detected in the public source or compiled client assets during verification.

`JUPITER_API_KEY` is optional and was not configured. Keyless Jupiter access passed from Vercel. The configured public Solana mainnet RPC also passed from Vercel. Public providers can throttle; shared Postgres request coordination is enabled automatically on Vercel to bound aggregate upstream request starts. This does not reserve third-party capacity or provide an upstream uptime guarantee.

## Supabase

Both SQL migrations were applied to the hosted project. Ownership, grants, invalid-input rejection, plan limit, and deletion were verified in the real database with a transaction that rolled back all fixtures. Provider-slot SQL was tested for spaced slots and a bounded backlog in another rolled-back transaction. The provider-slot table intentionally has RLS and no browser policies or grants; only the server service role may reserve slots.

`supabase/config.toml` manages only the Lotline Auth settings: production Site URL, exact production/local callback URLs, minimum password length 12, and required email confirmation. A post-push comparison found zero differences for managed properties. Unspecified provider defaults were preserved. Preview URLs are deliberately not wildcard-allowlisted for confirmation/recovery links.

The security advisor reported an informational no-policy notice on the server-only quota table, consistent with its deliberate deny-all browser design. The performance advisor reported an informational default absolute Auth connection count. Neither was an error or warning.

## Email delivery remains to configure

The deployed sign-in form and hosted password sessions are implemented. New signup and recovery forms are deliberately gated by `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false` until public confirmation and password-reset delivery are verified. A custom SMTP provider and verified sending domain are required. Supabase's built-in sender is restricted to organization team addresses and a low email quota. Email confirmation remains enabled. Do not claim public email delivery is verified until the sender is configured, the flag is rebuilt as `true`, and its real delivery tests pass.

Configure the provider under Supabase Authentication → Email → SMTP with its host, port, username, password, From address, and sender name. Keep those credentials out of source control and browser environment variables. Follow the provider's DNS verification requirements, then test confirmation and recovery through the production origin.

## Verification and release

See [deployed live observations](deployed-live-smoke.json), [verification record](integration-verification.md), [accounts](accounts.md), and [PWA behavior](pwa.md). No transactions were signed or submitted. No hackathon entry was submitted.

For a source-driven release, push reviewed changes to `main` and check GitHub Actions plus the connected Vercel deployment. A manual authorized release can use `vercel deploy --prod` from this project. Recheck deployed Live, auth, and offline behavior when the relevant adapters or assets change.

References: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls).
