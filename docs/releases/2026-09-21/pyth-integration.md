# Pyth reference provenance and access gate

The adapter reads independent Pyth USD references for the existing USDC contribution review. It does not request transactions or change Jupiter estimates. The first release maps only the pinned Solana AAPLx, MSFTx and NVDAx identities to six verified Pyth feed IDs. Other catalog assets explicitly have no verified mapping.

## Official sources and observed access

The [public discovery fixture](pyth-public-discovery.json) records official Hermes catalog responses, captured on September 20, 2026 UTC (September 21 in the workspace timezone). Each feed's exact ID, symbol, quote currency, asset type and market-hours metadata is preserved. The feed discovery endpoints returned HTTP 200 without credentials.

Latest-price requests for the six exact IDs returned HTTP 401 `unauthorized` on both official endpoints. No price, confidence, exponent or publish time was returned. No actual price fixture is claimed. Unit tests construct explicitly synthetic price payloads to verify normalization and failure handling.

[Pyth's current getting-started documentation](https://docs.pyth.network/price-feeds/core/getting-started) states that Core Hermes requires an API key following its August 26, 2026 upgrade. [Its fetch guide](https://docs.pyth.network/price-feeds/core/fetch-price-updates) identifies the upgraded endpoint and bearer authorization. This is a Core access requirement, not merely a Pro requirement. At this release the adapter used the fixed official endpoint `https://pyth.dourolabs.app/hermes/v2/updates/price/latest`, and reads `PYTH_API_KEY` only on the server. An absent or denied key yielded `configuration-required`, with no sample-price fallback. No account signup, paid subscription, key acquisition, transaction, or feed update was performed.

*Update, September 26, 2026:* the default host is now the public `https://hermes.pyth.network` (same `/v2/updates/price/latest` route; `PYTH_HERMES_URL` accepts an https mirror origin such as `https://pyth.dourolabs.app/hermes`). The Bearer header is sent only when `PYTH_API_KEY` is set. Without a key, Lotline reads Crypto.USDC/USD keyless from Pyth's sponsored `PriceUpdateV2` receiver account on Solana mainnet (`lib/server/pyth-onchain.ts`) and labels it `solana-receiver`; with a key that on-chain post cross-checks the Hermes currency leg. Feed identities are verified against the official Pyth MCP `get_symbols` tool by `tests/pyth-identity.live.test.ts` and `scripts/verify-pyth-feeds.mjs`.

## Unit basis

The [issuer's multiplier guide](https://docs.xstocks.fi/developers/multipliers) distinguishes unchanged Solana raw balances from Scaled UI Amount balances, which account for corporate actions. Lotline's existing mint-and-clock conversion produces the displayed scaled quantity.

The pinned equity feeds identify USD per underlying share. The token feeds identify xStock/USD pairs, but the retrieved metadata does not establish whether the quoted token quantity corresponds to Solana raw units, scaled display units, or a venue's normalization. The adapter therefore labels that basis `unverified-token-unit`. A Pyth forum answer describes [multi-venue aggregation](https://dev-forum.pyth.network/t/xstocks-price-feed-aggregation-question/769), without resolving the Solana unit basis.

The two USD references are shown independently. Their ratio is not a verified premium. Dividing a USDC Jupiter spend by scaled token output also does not establish an oracle-equivalent USD execution price. This release calculates neither comparison and makes no USDC/USD parity assumption.

## Data contract and limits

`POST /api/market-reference` accepts `{ "mints": ["<verified catalog mint>"] }`, with one to ten unique mints. It accepts no arbitrary feed ID, endpoint, wallet or transaction. An unknown non-catalog mint is invalid input; a known but unmapped xStock gets an unavailable item. Responses use the exported browser schema in `lib/domain/market-reference.ts`.

Each returned observation keeps its original integer price and confidence strings, exponent, feed ID and publish time. Decimal prices and confidence basis points use BigInt arithmetic. Confidence basis points describe Pyth's confidence interval relative to price, not a DEX bid/ask spread. Nonpositive prices, confidence at least as large as price, unsafe integer strings, exponents outside -12 through 12, future timestamps, unknown IDs, duplicate IDs and malformed responses are rejected.

Freshness lasts strictly less than 60 seconds from the original `publish_time`; retrieval, cache access and client rendering do not renew it. Old equity observations, including those outside market hours, remain explicitly stale. Feed schedules are not used to imply current observations or DEX trading availability. Mixed fresh/stale or missing references yield a partial response.

Requests coalesce by the selected mint set, cache for five seconds while preserving original timestamps, and have four queued/in-flight batches at most. The process spaces requests by at least 1.1 seconds and caps starts at 20 per minute, with a one-minute cooldown after HTTP 429. These limits are process-local, not a global provider quota guarantee. The HTTP body is streamed with a 256 KiB bound and a 6.5-second timeout, redirects are denied, and provider errors/credentials are not copied into responses.

## Validation

`npx vitest run tests/pyth-reference.test.ts` passed 28 tests during implementation. They cover exact decimal preservation, timestamps and cache expiry, malformed and duplicate feed data, partial coverage, missing/denied credentials, sanitized errors, body limits and cancellation, request coalescing, supported identities, and route input bounds. The read-only public discovery is the real provider evidence; synthetic unit tests do not establish authenticated live-price access. A configured-key live read remains necessary before claiming actual Pyth price delivery.
