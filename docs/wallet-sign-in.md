# Wallet sign-in

Added 29 September 2026 behind the server flag `LOTLINE_WALLET_SIGN_IN_ENABLED`. With the flag unset, `/sign-in` and `/sign-up` render exactly as before (the main browser suite asserts it), and no wallet code runs on them.

## What people get

- **Sign in with a Solana wallet** on `/sign-in`, and **Create an account with a Solana wallet** on `/sign-up`, above the email form. Every wallet that registers with the page through the Wallet Standard is listed: browser extensions such as Phantom, Solflare and Backpack, and, on Android and Seeker, wallet apps through Mobile Wallet Adapter, which the layout already registers.
- One signature, never a transaction. The wallet signs a Sign in with Solana message that names the page, the time and this statement: *"Sign in to Lotline. This proves you hold this wallet; it sends no transaction and moves no funds."* The first signature creates the account, so no email is needed.
- A wallet that supports Sign in with Solana writes and checks the message itself, with its dedicated prompt. Otherwise the wallet connects and signs the same text as a plain message.
- A declined prompt, a switched-off provider, a rate limit or a clock far enough off to fail verification each get their own message. A prompt left open can be cancelled, and it never blocks another sign-in, because the wallet signs outside the account request queue and only the short request to Supabase Auth goes through it.
- Signed in, the planner's account panel reads "Signed in as wallet 7xKX…gAsU".

## How it works

`lib/client/wallet-sign-in.ts` asks the wallet for a proof: the exact text it signed and the Ed25519 signature. `components/wallet-sign-in.tsx` sends both to Supabase Auth with `signInWithWeb3({ chain: 'solana', message, signature })`, through the same serialized account transport as email sign-in, so an abandoned attempt can never save a session. Supabase Auth checks the signature, that the message's URI is an allowed redirect URL and its domain matches, and that it was issued within the last ten minutes. It then records the identity as `web3:solana:<address>`. `/api/auth/session` returns that address as `wallet`.

The message text matches, byte for byte, the one Supabase's own client writes (a unit test compares them), so Supabase Auth's parser accepts it.

## Turning it on

1. In Supabase (project `uemunksopacicpbjubtg`), under **Authentication → Sign In / Providers**, enable **Web3 Wallet** for Solana.
2. Under **Authentication → URL Configuration**, keep the **Site URL** on the production host (`https://lotline.dev`). Supabase Auth accepts a sign-in message from any page on the Site URL's host. Add `https://<host>/**` under **Redirect URLs** for every other host that should offer wallet sign-in, such as a preview domain.
3. Under **Authentication → Rate Limits**, review **Web3 sign-ins** (30 per 5 minutes per IP by default).
4. Set `LOTLINE_WALLET_SIGN_IN_ENABLED=true` in Vercel and redeploy.

Until step 1 is done, a signature is answered with "Wallet sign-in isn't switched on for this deployment yet".

## Know before switching it on

Wallet accounts carry no email and cost nothing to create, which Supabase's own guide flags as a route to automated sign-ups. Community plans count each account's copy once, so with both flags on, someone with many wallets could raise a plan's copy count. Keep the Web3 rate limit low. Before relying on copy counts, consider CAPTCHA protection. It needs a widget on both forms, because Supabase then requires a CAPTCHA token on every sign-in.

## Tests

- `tests/wallet-sign-in.test.ts`: which wallets qualify; a Sign in with Solana wallet's own text is sent unchanged; a message-only wallet connects, picks the Solana account that can sign, and signs the Lotline text (both verified with a real Ed25519 key); parity with Supabase's client text; an unanswered prompt ends on cancel; the wallet identity and error messages.
- `tests/auth-transport.test.ts`: the web3 grant is scoped like a password sign-in, so an abandoned attempt saves no session.
- `tests/supabase-api.test.ts`: the session route adds the wallet address only for a Solana wallet identity.
- `tests/e2e-markets/wallet-sign-in.spec.ts` (flag on): sign-in and sign-up through a Sign in with Solana wallet and a message-only wallet, the exact text and signature Supabase Auth receives, the session cookie and the account panel, declining, a switched-off provider, a prompt left open then cancelled, no wallet, and an axe check at 390px.
- `tests/e2e/markets-flag.spec.ts` (flag off): both pages are unchanged.
