# October 1 launch film and mainnet readiness

Status: launch-film implementation, local playback checks and independent review passed. CI and production deployment are pending for this release. A real purchase is waiting on the selected public wallet, asset, maximum USDC amount and reviewed participant eligibility. No transaction has been signed or submitted.

## Mainnet evidence

The [production configuration audit](mainnet-configuration.json) confirms keyless Jupiter access, the acknowledged semantic validator, Supabase repository and required base, guest, integrity and proof migration flags. Purchase activation is still off. The restricted-launch policy and reviewed-wallet list are not configured. The optional batch acknowledgement remains off.

Vercel redacts sensitive values in CLI exports. The audit does not interpret redaction as a missing credential: the deployed server reports receipt reconciliation available, which establishes its required configuration is present. The export cannot independently verify the private RPC URL or key contents.

The [hosted database audit](mainnet-readiness.json) found all 11 migrations applied, including the optional batch migration. Journal RLS, immutable proof and batch guards, indexes, constraints and owner-scoped schedule policies are present. No private account records were queried and no schema repair was needed.

The [bounded provider checks](providers.json) observed 832 verified xStock identities, including nine issuer-halted assets, and eight verified PreStocks identities. One Pyth request returned fresh equity, token and USDC observations at the recorded time. Unit-basis/session limitations remain in the evidence. A keyless 1-USDC AAPLx quote used Metis/direct Raydium CLMM and returned no transaction because no taker was supplied. These reads establish dated availability, not a purchase or an executable route for every catalog asset.

## Remaining settlement steps

1. Obtain the intended participant's public wallet, selected asset, maximum spend and eligibility review. Never collect a recovery phrase or private key.
2. Add only that reviewed wallet to the existing restricted-launch policy. Confirm funding for the reviewed USDC amount and SOL costs.
3. Enable the restricted purchase capability only after its prerequisites pass. The supported path remains scaled Token-2022 xStocks through Metis/direct Raydium CLMM. PreStocks and crypto purchases remain outside this validator's scope.
4. Prepare a fresh order in the application, validate its exact amounts, instructions, fees, simulation and required Pyth references, and present the review to the wallet owner.
5. The wallet owner approves and signs the transaction. The agent does not perform that financial approval.
6. Reconcile the original signature and exact token movements before claiming a completed contribution. An unknown result blocks replacement orders.

The issuer publishes [access restrictions and eligibility terms](https://xstocks.com/). A catalog listing, quote or configured allowlist does not by itself establish eligibility. Jupiter's [order and execute documentation](https://developers.jup.ag/docs/swap/order-and-execute) distinguishes a no-taker price quote from an assembled transaction requiring a taker.

## Launch film

The user supplied a 30-second 1920×1080 60fps launch showreel with its original music and sound effects. The site integration preserves the original file and uses an optimized derivative, captions, a text description and explicit animated/illustrative scope. It is promotional media, not footage proving an executed mainnet purchase. Current app walkthroughs and historical films remain available separately.

## Validation and deployment

The original film is unchanged. Its web rendition is 16,449,191 bytes (about 68% smaller), remains 1920×1080 at 60fps and preserves the original AAC packets exactly. All 1,800 video frames decode successfully; fast-start metadata precedes the media payload.

All six focused browser cases passed at 390px and 1440px: two new launch-film cases, two current-tour cases and two archive cases. They cover playback, captions, original audio, seeking, single-film playback and accessibility. An initial inline-credit link accessibility finding was corrected with an explicit underline and both launch cases then passed. Scoped lint, whitespace checks and independent source/media review passed. Full CI and hosted verification are pending.
