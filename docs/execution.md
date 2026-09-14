# Lotline execution readiness

Lotline separates planning from settlement. Example mode is always read-only. Live execution is an opt-in server capability and is disabled unless every readiness gate is present.

The execution flow is:

1. The browser builds an immutable contribution intent from the verified catalog and exact raw USDC allocations.
2. The server validates the intent, verifies the issuer catalog again, and stores a durable run and leg journal in Supabase.
3. The server requests a Jupiter Swap v2 `/order` with the connected wallet as `taker`, validates the v0 payer, lifetime, route, fees, slippage, and message hash, then returns the unsigned bytes for review.
4. A Wallet Standard wallet signs those exact bytes with `solana:signTransaction`. Lotline never uses a wallet `signAndSend` method.
5. The server sends the signed bytes to Jupiter `/execute`, records the provider request id and signature, and keeps the attempt in `confirming` until Solana returns a confirmed or finalized receipt.

The state machine is append-only in `lotline_execution_events`: `planned → quoting → review-required → awaiting-wallet → signed → submitted → confirming → confirmed`. Rejection, on-chain failure, expiry, and an inconclusive provider response are terminal or retry-blocked states. A missing receipt never creates a second order.

```mermaid
stateDiagram-v2
  [*] --> planned
  planned --> quoting
  quoting --> review-required
  review-required --> awaiting-wallet
  review-required --> expired-unbroadcast
  awaiting-wallet --> signed
  awaiting-wallet --> rejected
  signed --> submitted
  signed --> unknown
  submitted --> confirming
  submitted --> unknown
  confirming --> confirmed
  confirming --> failed-onchain
  confirming --> unknown
  unknown --> confirming
  unknown --> failed-onchain
```

The first adapter intentionally supports only Jupiter v0 transactions with a wallet payer, a single wallet signer, the `iris` or `metis` router, bounded provider fees and a fresh lifetime. Other routers, extra signer requirements, malformed lookup-account layouts, and unsupported instruction combinations fail closed before the wallet prompt. This is a supported subset, not a universal Solana transaction policy.

## Configuration gates

Set these server-only values in the deployment environment before enabling the feature:

```text
LOTLINE_EXECUTION_ENABLED=false
LOTLINE_EXECUTION_MIGRATIONS_READY=false
LOTLINE_EXECUTION_REPOSITORY=supabase
LOTLINE_EXECUTION_VALIDATOR_READY=false
JUPITER_API_KEY=...
SOLANA_RPC_URL=https://...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Apply `supabase/migrations/20260914090000_execution_journal.sql` in the linked project, verify service-role access from the server, review the supported-instruction validator against representative Jupiter v0 transactions, and only then change the execution flags. The readiness endpoint is `GET /api/execution/config`; a `503 configuration-required` response is an intentional safety boundary.

Guest execution and automated scheduled purchases are not enabled. Schedules are saved as a device-local reminder and can export a calendar event; they remain manual review points. No private key, wallet address, or signed transaction is saved in browser storage.

Signed-in users also have an owner-scoped `/api/contribution-schedules` GET/POST/PATCH route backed by the journal migration. The current UI keeps the local reminder path available for guests; cloud synchronization remains opt-in.

## Provider coverage

| Boundary | Current release | Explicitly deferred |
| --- | --- | --- |
| Solana RPC | Wallet identity, issuer/mint checks and signature reconciliation | Custody, delegated signing or automatic SOL funding |
| Jupiter Swap v2 | Server `/order` and `/execute` adapter for validated v0 `iris`/`metis` orders | Other routers, RFQ/counterparty signers and unchecked instruction layouts |
| xStocks issuer catalog | Exact symbol plus Solana mint, halt status and logo provenance | Catalog presence as proof of legal eligibility or liquidity |
| Supabase | Authenticated owner journal and schedule metadata with RLS | Browser access to execution journal or service keys |
| Jupiter Recurring | Documentation reference only | Automated xStocks DCA; current Token-2022 support is not enabled |

## Local verification

With the feature flag left off, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -- tests/e2e/execution-readiness.spec.ts
```

These checks prove that the disabled boundary, intent math, state transitions, and read-only Example experience work. A real purchase requires a funded test wallet, a production Jupiter key/RPC, applied Supabase migration, and a deliberate operator approval; no live settlement is claimed by local CI.

## Browser evidence

Captured from the local Next.js app at `2026-09-14T16:28:31Z` with the execution gate intentionally disabled. The full-page screenshots show the current Example journey, including the read-only execution boundary and manual reminder controls:

- [Desktop Example walkthrough](screenshots/execution-example-1440.png) (1440px viewport)
- [Mobile Example walkthrough](screenshots/execution-example-375.png) (375px viewport)

The Playwright run `E2E_BASE_URL=http://127.0.0.1:3111 npm run test:e2e -- tests/e2e/execution-readiness.spec.ts tests/e2e/planner.spec.ts` passed all 9 journeys, including 375px, 768px and 1440px layouts, keyboard planning, export, and the disabled execution boundary. No hydration error was emitted by the dev server during capture.
