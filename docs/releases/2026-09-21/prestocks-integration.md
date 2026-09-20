# PreStocks read-only integration

Verified on 2026-09-21 in Asia/Ho_Chi_Minh (the evidence records UTC timestamps).

## Sources and observed contract

- Official asset data: <https://prestocks.com/api/prestocks>
- Official products: <https://prestocks.com/products>
- Official example product: <https://prestocks.com/openai>
- Jupiter quote-only semantics: <https://dev.jup.ag/api-reference/swap/order>

The public API currently returns a flat array of eight assets. Each row contains `name`, `symbol`, `description`, `image`, `external_url`, `contract_address`, `markPrice`, `markValuation`, `tokenPrice`, `impliedValuation`, and `supply`. It provides no chain identifier, mint decimals, halt flag, or price publication timestamp. The adapter uses only pinned identity fields and verifies mint properties on Solana mainnet. Provider reference prices are not used as executable quotes or labeled fresh market prices.

Pinned symbols: ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET, SPACEX. All eight are initialized Token-2022 mints with nine decimals and Scaled UI Amount configuration. On-chain metadata matched the official identity and metadata URI for each mint. OPENAI's observed multiplier was 1.4861347 and SPACEX's was 5; the others were 1. Conversion uses the existing official Token-2022 helper and a confirmed mint/Clock snapshot rather than hardcoded multipliers.

The current mints also contain TransferFeeConfig, ConfidentialTransferFee, PermanentDelegate, DefaultAccountState, ConfidentialTransferMint, TransferHook, MetadataPointer, PausableConfig, and TokenMetadata. Observed pause flags were false and transfer hooks disabled. Transfer fees are nonzero. These observations do not authorize or establish support for execution; existing execution restrictions remain unchanged.

## Endpoints

| Endpoint | Method | Request | Response |
| --- | --- | --- | --- |
| `/api/prestocks/assets` | GET | None | `CatalogResponse` |
| `/api/prestocks/quotes` | POST | `{items: [{mint, usdcRaw}]}` | `QuotesResponse` |
| `/api/prestocks/holdings` | GET | `?owner=...&mints=mint1,mint2` | `HoldingsResponse` |
| `/api/prestocks/units` | POST | `{items: [{mint, raw}]}` | `ProjectionResponse` |

The existing three-asset per-request bounds, integer raw amount bounds, body limits, and no-store response headers apply. Only the pinned PreStocks universe is accepted. Assets include `issuerId: "prestocks"`, `instrumentId: "prestocks:solana:<mint>"`, official source and product URLs, and `halted: null`. A false on-chain pause flag is never converted into a claim that the issuer has reported trading resumed.

Quotes use the shared Jupiter request queue and provider reservation. Before a quote, the adapter verifies the current issuer identity, reads the mint fresh, checks the exact on-chain metadata, and refuses paused or unverifiable pause state. Provider coordination must not age issuer verification to 30 seconds. Requests contain only input mint, output mint, and raw USDC amount; no taker, wallet, transaction submission, or execution is used. Identical quotes retain their original timestamps in a cache of at most five seconds.

Holdings use the existing conservative account-extension policy. TransferFeeAmount, confidential balances, and unknown extensions produce explicit unavailable raw and displayed balances, never a fabricated zero. This first version does not support all PreStocks wallet balances. Unit projection remains available for validated raw amounts independently of wallet-account support.

## Evidence

- `prestocks-official-fixture.json`: bounded official fields, omitting descriptive marketing text.
- `prestocks-verification.json`: exact identities, Solana mainnet genesis, confirmed slots, mint extensions and scaling observations, bundled logo hashes, and one read-only quote.

The 10 USDC OPENAI quote returned raw output `6016666`, converted to `0.008941576` display units using the observed mint scaling. Jupiter returned `transaction: null`. No transactions were signed or submitted. RPC configuration values and API keys are omitted.
