# Live integration verification — September 11, 2026

The repeatable adapter smoke passed at **2026-09-11 15:41:26 UTC** using the public Solana mainnet RPC and no Jupiter API key. The exact normalized observations are in [live-smoke.json](live-smoke.json). These are dated evidence, not future prices or a promise of service availability.

- All six selected symbols resolved through the official issuer Assets API. Each had one exact `network: "Solana"` deployment. Binary chain mint decoding verified Token-2022 ownership, eight decimals, initialization, and a valid Scaled UI Amount extension for AAPLx, MSFTx, NVDAx, TSLAx, SPYx, and QQQx.
- A real `getTokenAccountsByOwner` read for the independently public AAPLx mint-authority address confirmed **zero AAPLx and zero USDC**. This address is documented only for reproducibility; it is never presented as the user's wallet. This smoke did not demonstrate a nonzero wallet holding or a wallet with multiple accounts; deterministic tests exercise the multi-account BigInt summation and ownership checks.
- A real keyless `GET /swap/v2/order` quote with only USDC input mint, AAPLx output mint, and `amount=10000000` returned **2,964,944 raw output units**, which the mint-aware helper converted to **0.02974636 estimated AAPLx units**. Adding raw holdings and quote output first produced the same estimated resulting units because this public address held zero.
- The quote-only request omitted `taker` and every wallet address. The raw upstream observation returned `transaction: null`; the server emits no transaction field. No transactions were constructed locally, signed, sent, or submitted.

Run the same adapters again from the project directory:

```sh
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com LOTLINE_LIVE_SMOKE=1 npx vitest run tests/server-live.test.ts
```

The opt-in test rewrites `docs/live-smoke.json` with the new time and observations, intentionally omitting the configured RPC URL value and API key. The regular test suite skips this external-service test. Configure the server environment before starting Next.js; Example mode requires neither service.

## Verified behavior and limits

The installed `@solana-program/token-2022` **0.17.0** exports `amountToUiAmountForMintWithoutSimulation`. Its installed implementation fetches the decoded mint and Solana clock sysvar and selects `newMultiplier` when chain time reaches `newMultiplierEffectiveTimestamp`. The service uses that helper for current balances, quote outputs, and projected raw sums. Tests encode actual mint data with its package encoder and verify 1.25 before activation and 2.5 at activation. Failed decoding, missing scaling, invalid multipliers, or unavailable chain time produce unavailable units; there is no multiplier-one fallback.

Public RPC access is best effort. During investigation, `getTokenLargestAccounts` returned an RPC 429; that exploratory method is not used by the application. The application balance reads and mint reads succeeded. A dependable shared demonstration should use a suitable RPC service; an optional private Jupiter key improves the available quota. API keys are never browser configuration or response fields.

Jupiter's current rate-limit documentation explicitly supports keyless **30 requests per minute**. This app spaces starts at least 2.1 seconds apart, including when a key is present, and caps queued/active quote work at six. Limits and caches are process-local: deploy one server instance for this MVP, or add a shared limiter before scaling across instances. Other applications sharing the same IP or Jupiter organization can still cause 429 responses. Failed requests are surfaced with a refresh affordance and are not retried indefinitely.

Catalog identity is cached for approximately one hour; issuer halt information is rechecked through a 30-second cache on fresh quote requests. A cached catalog halt cannot prevent a resumed asset from being rechecked. Holdings cache for 15 seconds, identical quotes for at most five seconds, and cached quotes retain the original retrieval time. Every quote expires after at most 30 seconds, or sooner when a valid provider expiry is present. Unrecognized expiry formats fail closed. Current live Metis quotes omitted provider expiry; the 30-second limit applied. Fee basis points and fee mint are reported when provided; zero quote-only network fee fields are not presented as proof of a free trade.

## Official sources checked

- [xStocks Assets API](https://docs.xstocks.fi/apis/openapi/assets) and [live AAPLx issuer endpoint](https://api.xstocks.fi/api/v2/public/assets/AAPLx): issuer identity, deployments, and trading-halt information.
- [xStocks developer guide](https://docs.xstocks.fi/developers) and [multiplier guide](https://docs.xstocks.fi/developers/multipliers): dividend/split scaling and current/pending multipliers.
- [Solana Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount): mint-aware units and scheduled multiplier semantics.
- [Official token-2022 JavaScript source](https://github.com/solana-program/token-2022/blob/main/clients/js/src/amountToUiAmount.ts): helper and chain-clock implementation, additionally verified against the installed package.
- [Jupiter Order & Execute](https://developers.jup.ag/docs/swap/order-and-execute) and [Get Order API reference](https://developers.jup.ag/docs/api-reference/swap/order): no-taker quote behavior, normalized fields and provider expiry.
- [Jupiter rate limits](https://developers.jup.ag/docs/portal/rate-limits): keyless access, sliding-window quotas, and rate-limit behavior.
