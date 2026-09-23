# PreStocks + Pyth review follow-through

Canonical production URL: https://lotline.dev. This release preserves the separate PreStocks planner, original films, brand, authentication and exact allocation calculations.

## Implemented

- PreStocks discovery and planning cover eight pinned issuer identities. A fresh production check on September 23 obtained eight successful catalog verifications and eight successful 10-USDC read-only estimates, with mint/Clock observations and scaled-unit conversion. See [recorded observation summaries](hosted-prestocks-before.json). These calls did not purchase anything.
- The xStocks review shows Pyth equity and token prices, confidence, original timestamps and a feed-price ratio for AAPLx, MSFTx and NVDAx. The ratio uses integer arithmetic rounded down to eight decimal places and disappears when either observation expires. Its value is schema-checked rather than trusted from a display field.
- Purchase review requires fresh pinned references for mapped, nonzero allocations, including restored runs. Missing configuration, failed refreshes, stale observations and edited plans revoke readiness. Initial review also requires a current estimate for the exact USDC allocation.
- Browser checks cover review preparation, the cross-tab wallet lock and returned signatures. Server checks cover both new and reused unsigned orders, submission and expiry after waiting for the Jupiter provider slot. A signed transaction stopped before dispatch retains its original-signature reconciliation lock; the journal records that Lotline transmitted nothing.
- Receipts remain recoverable when references are unavailable. Unmapped assets do not gain fabricated Pyth mappings. PreStocks remains planning-only with an independent Jupiter handoff.

## Limits of the price comparison

The token feed's unit basis is not verified against Solana scaled display units or an underlying share. A ratio between the two USD feed numbers therefore provides feed context, not a token premium/discount, fair value, or oracle-equivalent Jupiter execution price. USDC/USD parity is not assumed. Completing a verified execution-price comparison requires authoritative token-feed unit provenance and a consistent input-currency conversion.

The [issuer oracle API](https://api.xstocks.fi/api/v2/public/oracles/AAPLx?managedBy=Pyth&pageSize=200) confirms the pinned AAPLx Pyth feed for Solana, but supplies no quantity-basis field. The [issuer multiplier guide](https://docs.xstocks.fi/developers/multipliers) defines scaled token exposure without establishing the Pyth token-feed publisher normalization. Neither source resolves that comparison gap.

Freshness is strictly less than 60 seconds from publication. Requiring both token and equity feeds means mapped purchases can be blocked outside equity-feed publication hours. The app says this explicitly; closed-market observations are not relabeled fresh. Jupiter estimates keep their separate maximum 30-second lifetime.

## Production prerequisites

The authenticated production environment listing on September 23 did not contain `PYTH_API_KEY`, `JUPITER_API_KEY`, `LOTLINE_EXECUTION_ACCESS_POLICY`, or `LOTLINE_EXECUTION_ALLOWED_WALLETS`. RPC, Supabase journal and migration/validator readiness variable names were present; name presence alone does not certify their values. Hosted execution returned `enabled:false` and `reconciliationAvailable:true`; the Pyth endpoint returned HTTP 200 with `configuration-required` and no observations.

Add the provider keys as Sensitive production variables in Vercel. Use a reviewed public wallet address for the existing `restricted-launch-v1` policy; never use a private key or seed phrase. A compatible mainnet route, funded wallet and separately approved asset/USDC/fee bounds are still required. No real settlement is claimed by local tests, read-only estimates or unsigned simulation. Execution restrictions must not be relaxed merely to create a sponsor demonstration.

Pyth access requirements: [official getting-started guide](https://docs.pyth.network/price-feeds/core/getting-started). Reference semantics and freshness: [official best practices](https://docs.pyth.network/price-feeds/core/best-practices). Historical feed provenance: [September 21 Pyth integration](../2026-09-21/pyth-integration.md).

## Verification and deployment

- Local: ESLint, canonical typecheck and the final production build passed. The initial full unit run passed 488 tests with two opt-in live tests skipped; the later complete CI run includes the additional server-boundary tests. All 16 targeted production-build browser checks passed locally, including 320px accessibility/overflow, PreStocks drafts/export/share, restored reviews, pending-wallet expiry, stale quote isolation and ratio expiry.
- [CI run 35811766064](https://github.com/operatoruplift/lotline/actions/runs/35811766064): lint, typecheck, 490 unit tests and the production build passed; two opt-in live tests skipped. Browser results were 106 first-pass successes and one success after retry. The latter test edited a plan before its order request finished; its expectation needed an established review. A subsequent test-only change explicitly waits for the sign button before editing and passed three consecutive local runs without retries. No production safety check was weakened.
- Independent code/TypeScript/security review found no remaining issues after the server dispatch-time expiry check was added. Fixtures do not establish authenticated Pyth price delivery or settlement.
- [PR #3](https://github.com/operatoruplift/lotline/pull/3) merged as `5db31c0dc51dc3f37c5a44514ee28e2716f4d82f`. Vercel production `dpl_7HTUwf6GtWQoYebQS7RNgKa2SPtf` is READY at https://lotline.dev and its metadata matches that exact source SHA. See [deployment identity](production-deployment.json).
- [Hosted checks](hosted-after.json): eight verified PreStocks assets, Pyth `configuration-required` with zero observations, execution disabled and reconciliation available. The [390px demo-page check](hosted-demo-check.json) found current release copy, no horizontal overflow and no page errors. [Screenshot](screens/hosted-demo-390.png). Existing videos remain dated and described as controlled rehearsals; no new live-settlement recording is claimed.

No wallet connected, transaction signed or funds moved in this release. Provider credentials, reviewed participant access, oracle unit-basis provenance and a separately authorized real purchase remain outstanding.
