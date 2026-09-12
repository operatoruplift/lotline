# Verified Solana xStocks catalog

Lotline includes **832 tokenized stocks and ETFs** from the issuer's Solana catalog, verified on September 12, 2026. All 832 have a unique Solana deployment, an initialized Token2022 mint with a supported `ScaledUiAmountConfig`, issuer identity information, and a bundled official 400×400 PNG logo. No assets were excluded from this snapshot. The catalog spans US and international equities plus ETFs; it does not claim to represent every ordinary exchange-listed stock.

The issuer's [List All Assets API](https://docs.xstocks.fi/apis/openapi/assets) documents the production endpoint, the `network=Solana` filter, zero-indexed pages, and a maximum page size of 100. Lotline fetched all nine pages from `https://api.xstocks.fi/api/v2/public/assets?network=Solana&pageSize=100&page=0`, following `page.hasNextPage`. This API also provides each underlying security identity, Solana deployment, official logo, and trading halt flags.

## Runtime verification

- `lib/domain/xstocks-registry.json` pins the reviewed symbol-to-mint identities. `lib/domain/assets.ts` exports this registry to the browser, saved-plan validation, and server adapters.
- A cold live catalog reads issuer pages in groups of four, validates pagination and unique identities, and refuses issuer deployment changes until the checked-in registry is reviewed.
- `getMultipleAccounts` verifies at most 100 mint accounts per RPC call, with no more than four calls in flight. Missing accounts, unsupported programs, missing scaling extensions, invalid multipliers, and mismatched batch lengths cannot become verified assets. An individual invalid account leaves the other valid assets available.
- Successful catalogs and immutable mint identity information are cached for one hour. Quote requests separately recheck issuer halt information with a maximum 30-second cache and reread scaling accounts on their existing short cache. Issuer halts remain visible; a catalog listing does not guarantee an available quote or trading route.
- Only raw token balances are converted with the installed Solana Token2022 mint-aware helper and chain clock. No decimals-only approximation replaces scaled units.
- Logo bytes are served locally from `public/logos/xstocks/`; `docs/xstocks-catalog-verification.json` records source, chain slots, observed halt flags, and every file's SHA-256 and dimensions.

## Refreshing the snapshot

Run `node scripts/refresh-xstocks-catalog.mjs` from the repository. Set `SOLANA_RPC_URL` in the environment or the ignored `.env.local`. The script performs bounded issuer pagination, validates unique Solana deployments and official logo URLs, verifies mint data in 100-account RPC batches, downloads and decodes logos with eight workers, then writes the sorted registry and evidence. A failed issuer request, RPC batch, or logo download aborts publication of the updated registry. Review any excluded assets or changed mint identities, update the database allowlist migration, run the catalog tests, and deploy together.

The pinned ordering keeps the six original assets first, followed by alphabetic issuer symbols. New issuer listings appear after a reviewed refresh, rather than silently changing saved-plan asset identities.
