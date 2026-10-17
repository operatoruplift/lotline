# Dependency review, September 26, 2026

Reading Meteora Dynamic Bonding Curve state needs Meteora's official TypeScript
SDK, because the curve quote is the program's own math and reimplementing it
would risk numbers that look right and are not. That SDK is built on the older
Solana JavaScript stack, so installing it adds `@coral-xyz/anchor`,
`@solana/spl-token` and their dependencies to the tree. Lotline's own code uses
`@solana/kit`.

`npm audit --omit=dev` reports six high-severity advisories from that chain:

| Package | Advisory | Patched version |
| --- | --- | --- |
| `bigint-buffer` | buffer overflow in `toBigIntLE()` | none published |
| `@solana/buffer-layout-utils` | depends on `bigint-buffer` | none published |
| `@solana/spl-token` | depends on `@solana/buffer-layout-utils` | none published |
| `toml` | uncontrolled recursion, prototype pollution | 4.2.0, pinned through `overrides` since 3 October 2026 |
| `@coral-xyz/anchor` | depends on `toml` | resolved by the `toml` pin; still moderate through `@coral-xyz/borsh` and `@solana/web3.js` |
| `@meteora-ag/dynamic-bonding-curve-sdk` | depends on the above | none published |

No release resolves the `bigint-buffer` chain: `bigint-buffer` 1.1.5 is both
the newest and the affected version, and the newest
`@solana/buffer-layout-utils` still depends on it. `toml` is different, and
this review originally got it wrong: 4.2.0 (13 July 2026) fixes both
advisories, but every Anchor release, 0.32.1 included, asks for `toml` ^3.0.0,
so npm cannot install it without an override. See the update below.

## What ships

The route that uses the SDK was checked against the production build. None of
`bigint-buffer`, `toml` or `@solana/spl-token` appears in the compiled output
for `app/api/dbc/quotes`. Lotline calls exactly two things from the SDK: the
program IDL, used to decode account bytes, and `swapQuote`, a pure function over
two decoded accounts and a slot. `toml` is required only by Anchor's
`workspace.js`, which loads an `Anchor.toml` workspace file and is never reached
from a decode or a quote.

## How the inputs are constrained

Every account the decoder sees is fetched by address from the Solana mainnet RPC
and checked to be owned by the Dynamic Bonding Curve program before it is
decoded, and its length is checked against the expected account size. Discovery
uses the program's own account filters. The path carries no user-supplied bytes:
a request names a mint from the verified xStocks registry and a raw amount.

## Re-checking this

```bash
npm audit --omit=dev                 # the six advisories above
npm run build                        # then grep the route output:
grep -rl "bigint-buffer\|toml\|spl-token" .next/server/app/api/dbc || echo "not present"
```

Re-run both after any change to `@meteora-ag/dynamic-bonding-curve-sdk`, which
is pinned exactly in `package.json` for this reason.

## Update, 3 October 2026

- **`toml` pinned to 4.2.0** through `overrides` in `package.json`. Anchor uses
  it in one place, `toml.parse` of an `Anchor.toml` in `workspace.js`. 4.2.0 is
  still CommonJS with the same `parse`, and refuses the `__proto__` key path
  behind the prototype-pollution advisory. `npm audit --omit=dev` now reports
  four high advisories, the `bigint-buffer` chain, instead of six;
  `@coral-xyz/anchor` drops to moderate. Remove the override once Anchor's own
  range admits a patched `toml`.
- **Next.js 16.3.8** for
  [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
  (critical): remote code execution in the Node.js `ImageResponse` from
  `next/og`. Lotline never imports `next/og` or `ImageResponse`, so it was not
  exposed; `eslint-config-next` moves with it.

