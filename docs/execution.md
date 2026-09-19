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

The adapter parses a narrow Metis v0 envelope with a wallet payer, one signer, bounded fee fields and a fresh lifetime. This envelope check does **not** establish encoded swap instruction safety. Current source therefore has an implementation gate that no environment flag can override: executable instruction decoding, approved account bindings, minimum-output/spend enforcement, mint-extension handling and simulation must be completed against representative current orders. Address lookup tables and other routers are rejected. No live purchase is claimed.

## Configuration gates

Set these server-only values in the deployment environment before enabling the feature:

```text
LOTLINE_EXECUTION_ENABLED=false
LOTLINE_EXECUTION_MIGRATIONS_READY=false
LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY=false
LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY=false
LOTLINE_EXECUTION_REPOSITORY=supabase
LOTLINE_EXECUTION_VALIDATOR_READY=false
JUPITER_API_KEY=...
SOLANA_RPC_URL=https://...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

The base `20260914090000_execution_journal.sql` is applied. The additive `20260915090000_guest_execution_owner_index.sql` and `20260919090000_execution_integrity.sql` were applied to the linked production project during the authorized September 20 release. The latter enforces per-run active-attempt exclusion, immutable transaction identity, owner-scoped occurrence uniqueness, unsigned expiry, atomic receipt/progress/event updates, unresolved evidence retention and schedule validation/versioning. Isolated PostgreSQL tests exercise the actual SQL; they do not certify multi-connection hosted concurrency. Complete the instruction validator and verify representative orders before enabling purchases. Set `LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY=true` only after the additive migration is applied and its quota/retention functions are checked. Both guest and integrity migrations passed hosted object/grant checks and rolled-back behavioral assertions; purchases remain disabled. The readiness endpoint is `GET /api/execution/config`; an HTTP 200 response with `state: configuration-required` and `enabled: false` is an intentional safety boundary.

Guest execution uses a short-lived, HttpOnly SameSite capability cookie scoped to the execution API; the server stores only its SHA-256 hash and binds every run to the selected wallet. It is available only when the readiness gate is enabled. Guest writes pass a bounded per-browser guard plus shared HMAC-hashed edge/IP and global buckets (180 requests per minute per normalized edge address, with a 600-request global ceiling), and a database quota of 20 journal runs per capability. Terminal guest runs are retained for 30 days, then pruned in bounded batches; abandoned non-broadcast reviews older than two days are also pruned unless a signed, submitted, confirming or unknown attempt exists. Unresolved guest history has a 50,000-row global ceiling. The journal also caps authenticated owners at 100 new runs per rolling day and all owners at 5,000 new runs per UTC day; sampled cleanup and indexed timestamps keep the limit tables bounded. The application guard is intentionally a first-line control; the shared buckets and database quota remain the durable limits across instances. Automated scheduled purchases are not enabled. Schedules are saved as device-local reminders and can export a calendar event; they remain manual review points. No private key, wallet address, or signed transaction is saved in browser storage.

If the same browser later signs in, the capability remains a separate guest owner and can be used to continue that browser's run; no guest record is relabeled as an account record and no wallet address supplied by the client is used as an ownership link.

Signed-in users also have an owner-scoped `/api/contribution-schedules` GET/POST/PATCH route backed by the journal migration. The current UI keeps the local reminder path available for guests; cloud synchronization remains opt-in.

## Provider coverage

| Boundary | Current release | Explicitly deferred |
| --- | --- | --- |
| Solana RPC | Wallet identity, issuer/mint checks and signature reconciliation | Custody, delegated signing or automatic SOL funding |
| Jupiter Swap v2 | Metis-only v0 envelope and signed-message checks; executable instruction validation remains incomplete | Other routers, RFQ/counterparty signers and unchecked instruction layouts |
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

These checks prove that the disabled boundary, intent math, state transitions, and read-only Example experience work. A real purchase requires a funded test wallet, a production Jupiter key/RPC, applied Supabase migration, and a deliberate operator approval **and the missing instruction-validator implementation**; no live settlement is claimed by local CI.

## Browser evidence

Captured from the local Next.js app at `2026-09-14T16:28:31Z` with the execution gate intentionally disabled. The full-page screenshots show the current Example journey, including the read-only execution boundary and manual reminder controls:

- [Desktop Example walkthrough](screenshots/execution-example-1440.png) (1440px viewport)
- [Mobile Example walkthrough](screenshots/execution-example-375.png) (375px viewport)

The Playwright run `E2E_BASE_URL=http://127.0.0.1:3111 npm run test:e2e -- tests/e2e/execution-readiness.spec.ts tests/e2e/planner.spec.ts` passed all 9 journeys, including 375px, 768px and 1440px layouts, keyboard planning, export, and the disabled execution boundary. No hydration error was emitted by the dev server during capture.

## September 19 continuation

The [finish report](finish-report-20260919.md) records current fixes and evidence. Receipt lookup remains available to the original owner when new purchases are paused, provided the journal/RPC are configured. It verifies the preserved signed message, signature, blockhash, mainnet genesis, confirmation slot, null transaction error, exact wallet-owned USDC debit, output minimum and SOL cost cap. Missing or inconsistent evidence stays unknown; provider failure does not authorize another purchase. Historical raw balances remain recorded without applying today’s scaling multiplier.

Manual reminders now retain the budget, selected asset split, cadence, IANA timezone, next date and version. Due reviews restore that snapshot; stable occurrence IDs prevent duplicate runs for one owner. Cloud synchronization uses an existing reminder ID for updates and remains opt-in. A reminder never signs or submits a transaction.
