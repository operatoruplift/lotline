# Optional Tokens.xyz context

Contract checked on **2026-09-12** against the official hosted documentation and [Solana Foundation repository](https://github.com/solana-foundation/tokens) at commit [`baf2ec5dd9737e07e77192e38b37e6303a3b1c83`](https://github.com/solana-foundation/tokens/tree/baf2ec5dd9737e07e77192e38b37e6303a3b1c83). The transport contract is verified; authenticated live enrichment has not been verified because this task did not obtain or create an API key.

## Verified public contract

The supported origin is `https://api.tokens.xyz/v1`. External integrations use `/v1/...`; the repository's `/api/v1/...` paths and first-party website proxy routes are implementation details. The provider explicitly documents a server proxy for key handling and caching. [Official overview](https://docs.tokens.xyz/v1/overview)

Authentication is the `x-api-key` request header with the `assets:read` scope. Keys stay on the server. Missing/invalid keys return 401; insufficient scope returns 403. The separate Clerk session endpoint is for Tokens' own apps and is not used by Lotline. [Authentication](https://docs.tokens.xyz/v1/authentication)

Lotline makes one asset-detail request for a selected mint:

```text
GET https://api.tokens.xyz/v1/assets/solana-<verified mint>?mint=<verified mint>
x-api-key: <server key>
Accept: application/json
```

The documented `solana-<mint>` reference resolves a known mint to its canonical asset group. The explicit `mint` parameter preserves the requested variant context. No search, ranking, primary-variant substitution, canonical-price call, or execution endpoint is needed. [Quickstart](https://docs.tokens.xyz/v1/quickstart), [asset detail](https://docs.tokens.xyz/v1/endpoints/asset-by-id)

The response's `asset.variantGroups` contains grouped variants. Lotline accepts exactly one matching Solana mint and reads only that row's name/label, kind, issuer, advisory and market context. It reads canonical identity from `asset.assetId` and optional `asset.name`. A contradictory resolution or explicit non-Solana chain is rejected. This v1 surface is Solana-specific; its public variant objects do not require a repeated chain field, so the adapter does not invent one in the upstream schema. [Official response builder](https://github.com/solana-foundation/tokens/blob/baf2ec5dd9737e07e77192e38b37e6303a3b1c83/apps/api/src/app/api/v1/assets/_asset-detail-response.ts), [variant types](https://github.com/solana-foundation/tokens/blob/baf2ec5dd9737e07e77192e38b37e6303a3b1c83/packages/asset-registry/src/types.ts)

## Authority and timestamps

The existing issuer/on-chain catalog remains the supported-mint gate. Tokens cannot add assets, change an issuer halt, substitute a representation, convert units, fill holdings, refresh quotes, or affect allocation arithmetic.

- `market.liquidity` is supplementary USD liquidity for the matched mint. It is never taken from `asset.stats` or `asset.primaryVariant`. In particular, mapped equity stats can include underlying stock-market data.
- `market.lastFetchedAt` is the provider snapshot retrieval timestamp, in Unix milliseconds. Lotline exposes it as `snapshotFetchedAt`, preserving the original instant.
- Optional `market.asOf` becomes `activityAsOf`. It can describe cached trade metrics. It is **not** labeled as a liquidity-only observation timestamp.
- The public payload does not offer an unambiguous liquidity-only observation time. The UI therefore labels the available timestamp as the provider snapshot time; it must not imply that retrieval equals an underlying market observation.

Those distinctions follow the actual provider serializer and source-selection code, which can combine overview/liquidity fields with separately sourced activity metrics. [Response builder](https://github.com/solana-foundation/tokens/blob/baf2ec5dd9737e07e77192e38b37e6303a3b1c83/apps/api/src/app/api/v1/assets/_asset-detail-response.ts), [snapshot selection](https://github.com/solana-foundation/tokens/blob/baf2ec5dd9737e07e77192e38b37e6303a3b1c83/apps/cloudrun-assets/src/handlers/marketSourceSelection.ts)

Lotline's own conservative display policy omits liquidity when the snapshot timestamp is absent, invalid, more than one minute in the future, or at least 15 minutes old. The latter is an explicit `stale` state. Missing fields remain absent, while an explicit valid zero is retained. Cached reads do not replace timestamps with the current time. No Tokens timestamp touches a Jupiter quote's expiry.

The source link is constructed locally as `https://tokens.xyz/<validated canonicalId>?solana=<exact mint>`. The provider's own runbook documents this variant-selection URL. Arbitrary response URLs are not followed or rendered. [Official URL behavior](https://github.com/solana-foundation/tokens/blob/baf2ec5dd9737e07e77192e38b37e6303a3b1c83/docs/operations/asset-advisory-runbook.md)

## Limits and failure behavior

The hosted contract defines per-key throughput and monthly quotas, with 429 for either limit. It does not publish a single numeric allowance that applies to every key. The current source supports project/environment overrides; its development fallback numbers are **not** a promise of an issued key's limits. Check the API Manager for that key. [Limits and errors](https://docs.tokens.xyz/v1/rate-limits-and-errors), [configurable limits](https://github.com/solana-foundation/tokens/blob/baf2ec5dd9737e07e77192e38b37e6303a3b1c83/apps/api/src/lib/env.ts)

This adapter adds these local bounds:

- Explicit action for one selected asset; no fetch per budget/percentage keystroke.
- A fixed provider origin and path, issuer-allowlisted mint, current catalog verification and no redirects.
- Four pending/active distinct lookups maximum; identical lookups share work.
- Sequential provider operations spaced by 1.1 seconds, at most 20 actual requests per process per minute.
- Five seconds for this caller's catalog verification and 5.5 seconds total for the upstream operation, including response consumption and retry delay.
- One retry at most for transient network/5xx errors; no immediate retry for 400/401/403/404/429. A 429 triggers a bounded local cooldown.
- A 256 KiB streamed response limit and bounded, typed variant arrays.
- A 128-entry process cache: context for at most 60 seconds, malformed/unavailable payloads for 10 seconds. Original snapshot age is checked again on cache reads.

Process-local limits do not replace provider enforcement across multiple deployed instances. Provider 429 responses remain authoritative. Failure messages are generic and never echo an API key or upstream body. The optional response is `no-store`; private data, live API data and these responses are not added to the service worker.

## Activation and access terms

The current official [Assets API page](https://tokens.xyz/assets-api) links **Get your API keys** to the [API Manager](https://app.tokens.xyz). During verification, that destination opened its sign-in route. No account, key, project or paid service was created. The [April beta article](https://solana.com/news/inside-tokens-xyz) is historical product context, not the current access policy.

The hosted [Terms of Service](https://tokens.xyz/terms), updated June 4, 2026, cover the API as well as the site. They restrict unapproved commercial use, systematic collection and redistribution. The repository's MIT code license is distinct from permission to use hosted data. Obtain a key for the intended integration and confirm any applicable API access/display conditions before enabling public enrichment. This task does not accept new provider terms or claim unrestricted data rights.

For approved access, configure these **server-only** variables using the names/placeholders in `.env.example`, then restart the local server:

```dotenv
TOKENS_XYZ_ENABLED=true
TOKENS_XYZ_API_KEY=<assets-read-key>
```

The default is disabled. Both the exact flag `true` and a nonempty key are required. If either is absent, the adapter returns `configuration-required` without contacting Tokens or the catalog. Guest planning, Example mode, quotes and saves remain independent.

## Local interface and verification

`GET /api/asset-details?network=solana&mint=<verified mint>` returns `AssetDetailsResponse`, with the runtime `assetDetailsResponseSchema` exported from `lib/domain/enrichment.ts` for browser validation. Supported states are `success`, `partial`, `stale`, `unavailable`, `configuration-required` and `invalid-input`. The compact details DTO contains only the fields described above; it contains no prices, wallets, holdings, quotes or credentials.

Tests use explicitly labeled synthetic contract fixtures **only inside the test file**. Coverage includes exact-mint/chain matching, contradictory resolution, duplicate variants, missing/malformed/future/stale data, genuine zero, timestamp retention and cache aging, optional gating, catalog failure, deduplication, queue/quota limits, provider cooldown, bounded bytes/deadlines/retries, safe source URLs and the no-store route.

Read-only live checks verified `/v1/health` returned 200, the API/key documentation is hosted, and an unauthenticated documented asset lookup returned the expected 401 missing-key envelope. These checks do not establish authenticated asset coverage, the eventual key's quotas, or successful live enrichment. Activation still requires an authorized `assets:read` API key and a subsequent authenticated smoke check.
