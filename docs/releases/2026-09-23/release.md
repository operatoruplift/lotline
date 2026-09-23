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

Freshness is strictly less than 60 seconds from publication. Requiring both token and equity feeds means mapped purchases can be blocked outside equity-feed publication hours. The app says this explicitly; closed-market observations are not relabeled fresh. Jupiter estimates keep their separate maximum 30-second lifetime.

## Production prerequisites

The authenticated production environment listing on September 23 did not contain `PYTH_API_KEY`, `JUPITER_API_KEY`, `LOTLINE_EXECUTION_ACCESS_POLICY`, or `LOTLINE_EXECUTION_ALLOWED_WALLETS`. RPC, Supabase journal and migration/validator readiness variable names were present; name presence alone does not certify their values. Hosted execution returned `enabled:false` and `reconciliationAvailable:true`; the Pyth endpoint returned HTTP 200 with `configuration-required` and no observations.

Add the provider keys as Sensitive production variables in Vercel. Use a reviewed public wallet address for the existing `restricted-launch-v1` policy; never use a private key or seed phrase. A compatible mainnet route, funded wallet and separately approved asset/USDC/fee bounds are still required. No real settlement is claimed by local tests, read-only estimates or unsigned simulation. Execution restrictions must not be relaxed merely to create a sponsor demonstration.

Pyth access requirements: [official getting-started guide](https://docs.pyth.network/price-feeds/core/getting-started). Reference semantics and freshness: [official best practices](https://docs.pyth.network/price-feeds/core/best-practices). Historical feed provenance: [September 21 Pyth integration](../2026-09-21/pyth-integration.md).

## Verification and deployment

Verification results and the resulting deployment are recorded after the final checks below. Browser fixtures are explicitly synthetic and do not establish authenticated provider access or real settlement.
