# Solana dApp Store listing

Everything the Publisher Portal (https://publish.solanamobile.com) asks for, ready to paste. The store's limits are in [docs/seeker-and-pwa.md](../seeker-and-pwa.md). Counts below are characters, as the Portal counts them.

## Text fields

| Field | Value | Count | Limit |
| --- | --- | --- | --- |
| App name | Lotline | 7 | 25 |
| Subtitle | Plan your next contribution | 27 | 30 |
| What's new | First release | 13 | |
| Description | Below | 2,994 | 10,000 |

### Description

The description says only what the shipped app does. It promises no returns, says Lotline is non-custodial and says in-app purchases are a restricted launch. The crypto clause in the first bullet is true while `LOTLINE_CRYPTO_ENABLED` is on; drop it if that flag is turned off.

```text
Lotline helps you plan your next contribution to tokenized stocks on Solana. Choose a USDC budget, pick your assets and set the split. Lotline shows what each part could buy right now, so the decision stays clear and stays yours.

PLAN YOUR SPLIT
- Choose from more than 800 issuer-verified xStocks, pinned crypto such as SOL, wrapped bitcoin and ether, and staked SOL.
- Set a budget and the percentages. Lotline checks that the split adds up to 100% and keeps your draft on this device.
- Plan pre-IPO tokens from PreStocks in a separate plan.

SEE READ-ONLY ESTIMATES
- Get estimates turns each part of your budget into estimated units, using live Jupiter quotes. An estimate never creates a transaction.
- Paste any public Solana address to see its balances beside the estimates. The address is used to read balances and is not saved.
- For supported stocks, compare an estimate with an independent Pyth market reference.

MARKETS
- Browse every asset Lotline verifies, with a dated market snapshot: price, 24-hour change, volume and liquidity.
- Open an asset to see its price chart, its verified mint and its issuer, then add it to your plan in one tap.

PORTFOLIO
- See your plan at a glance: the split, what it holds by type and how each asset moved today.

COMMUNITY PLANS
- Members can share a saved plan's name and split. Never a budget, a balance or a wallet.
- Plans rank by how often members copied them, never by returns.
- Copy a plan to open it with your own budget, or follow it to see when its author changes the split.
- Report a plan, or hide an author's plans on your device.

KEEP YOUR PLAN
- Copy a plan link, download a CSV, or set a review reminder and add it to your calendar. A reminder never buys anything.
- Accounts are optional. Sign in with Solana proves your address with one signed message and sends nothing on-chain. On Seeker it opens your wallet app through Mobile Wallet Adapter. Email sign-in works too.
- An account keeps up to 20 named plans across your devices. You can delete your account in the app at any time.

WHEN YOU ARE READY TO BUY
- Lotline opens each asset on Jupiter with its verified mint and the exact USDC amount filled in. You review and sign there.
- In-app purchases are a restricted launch, open only to reviewed wallets. Outside it, Lotline plans and hands off to Jupiter.
- Lotline is non-custodial. You sign in your own wallet. Lotline never asks for a private key or recovery phrase, and never holds your keys or funds.

KNOW BEFORE YOU PLAN
- Tokenized stocks come from third-party issuers under their own terms, and they are not available everywhere. Check the issuer's eligibility terms at xstocks.com before you buy.
- Prices move and you can lose money. Issuers keep controls such as freezing tokens. Some ETFs use daily leverage.
- Lotline is a planning tool. It is not investment, legal or tax advice, and it promises no returns.

Try it without an account or a wallet: Example mode uses synthetic balances and estimates.
```

## URLs and contacts

| Field | Value |
| --- | --- |
| Website | https://lotline.dev |
| Privacy policy | https://lotline.dev/privacy |
| Terms of use | https://lotline.dev/terms |
| Support email | Set in the Portal |
| Contact email | Set in the Portal |

Until `NEXT_PUBLIC_SUPPORT_EMAIL` is set, the privacy and terms pages send people to https://github.com/operatoruplift/lotline/issues. Use the same support address in the Portal and in that variable. Check that both legal pages load on https://lotline.dev before you submit.

## Other fields

| Field | Value |
| --- | --- |
| Publisher | Operator Uplift |
| Language | English |
| Token distribution | No |
| Copyright | © 2026 Operator Uplift |

## Country availability

Exclude every sanctioned country, and follow the xStocks issuer's eligibility terms at https://xstocks.com: if the issuer does not offer xStocks in a country, leave that country out too. The operator chooses the final list, with legal advice. An allowlisted wallet is not proof of eligibility, so the list is not the only control.

## Reviewer notes

Paste this into the Portal. If the review needs an email account, share its sign-in details privately in the Portal, never in this repository.

```text
Lotline is a planning app. Almost everything works without an account or a wallet, and testing never moves funds.

WITHOUT AN ACCOUNT
1. Open the app. It starts on the planner, https://lotline.dev/app.
2. For synthetic data, tap Plan in the tab bar, then Try the Example (or open https://lotline.dev/app?mode=example). Nothing in Example mode is real.
3. In Live mode, add assets, set a budget and a split, then tap Get estimates for read-only Jupiter quotes. To see balances, paste any public Solana address and tap Load balances. Nothing is signed or sent.
4. Markets: open an asset to see its price chart and verified mint, then tap Add to plan.
5. Portfolio: see the plan saved on this device.
6. Community: browse shared plans, open one, then Copy into my plan or Follow updates. Each plan's sheet and page also has Report and Hide plans from this author. If no plan is shared yet, sign in, save a plan in the planner and choose Share to community beside it.
7. Plan links: in the planner, tap Copy plan link and open the link on another device. Lotline asks you to review it before it replaces a draft.

FLOWS THAT NEED A WALLET
- Sign in with Solana: Account tab, then Sign in with a Solana wallet. On Seeker it opens Mobile Wallet Adapter. The wallet signs one message; no transaction is sent and no funds move. The first signature creates the account.
- In-app purchases: off outside a restricted launch for reviewed wallets. The planner says so. Open Jupiter hands each asset to Jupiter's own site, where the user reviews and signs. A reviewer cannot buy through Lotline.
- Email: existing email accounts can sign in. New email sign-ups open only when the operator turns on email delivery, so use wallet sign-in to create a test account.

ACCOUNT DELETION
- Signed in, open the Account tab (/sign-in) or the planner's account panel and tap Delete account. Confirm on the page. Lotline deletes the account and the data stored with it, signs out and confirms. On-chain transactions are public and cannot be removed. The privacy page lists exactly what is deleted.

COMMUNITY MODERATION
- Report: on a shared plan's sheet or page, tap Report and give a short reason. A plan reported by three different people is hidden, and the operator can hide or restore any plan.
- Hide plans from this author: hides that author's plans on this device, with a way to undo.
```

## Assets

| File | Size | Bytes | Shows |
| --- | --- | --- | --- |
| [`banner-1200x600.png`](banner-1200x600.png) | 1200 × 600 | 652,490 bytes | Wordmark, "Your next contribution, clearly." and a 250 USDC three-way plan card over the forest sculpture. |
| [`screenshots/01-portfolio.png`](screenshots/01-portfolio.png) | 1080 × 1920 | 146,240 bytes | Portfolio: a 250 USDC plan, ready, split 40 / 35 / 25 with today’s moves. |
| [`screenshots/02-planner.png`](screenshots/02-planner.png) | 1080 × 1920 | 128,639 bytes | Planner: the split across AAPLx, MSFTx and NVDAx, with the verified catalog. |
| [`screenshots/03-estimates.png`](screenshots/03-estimates.png) | 1080 × 1920 | 126,823 bytes | Live, read-only estimates for that plan from Jupiter quotes. |
| [`screenshots/04-markets.png`](screenshots/04-markets.png) | 1080 × 1920 | 138,976 bytes | Markets: the Stocks list with the dated Jupiter snapshot and Add to plan. |
| [`screenshots/05-asset-chart.png`](screenshots/05-asset-chart.png) | 1080 × 1920 | 121,067 bytes | Asset sheet for Apple xStock with its 7-day price chart and market figures. |
| [`screenshots/06-sign-in-with-solana.png`](screenshots/06-sign-in-with-solana.png) | 1080 × 1920 | 487,810 bytes | Sign in with a Solana wallet through Mobile Wallet Adapter. |
| [`public/icons/icon-512.png`](../../public/icons/icon-512.png) | 512 × 512 | 16,044 bytes | The app icon: the paper mark on a forest tile. |

The screenshots come from the live site, https://lotline.dev, on 7 October 2026 at about 18:04 UTC: a 360 × 640 viewport at device scale 3 with Android Chrome emulation and service workers blocked, so there is no browser chrome. Each is 1080 × 1920 and under 3 MB, and the Portal takes four to eight. The browser only read the site. It kept a sample plan (250 USDC split 40 / 35 / 25 across AAPLx, MSFTx and NVDAx) in its own storage and asked for read-only estimates; it never signed in or signed anything. Prices and estimates are that moment's real data.

Community had no shared plans on that day, so the live estimates screen stands in for it rather than an empty state. When members have shared plans, a Community screen can replace one of these.

The banner is `scripts/store-kit/banner.html`, built from the brand kit (the exact mark, the forest sculpture, the palette and the app's Georgia and system type) and rendered at 1200 × 600, device scale 1.

### Regenerate

```bash
node scripts/generate-store-kit.mjs            # banner and screenshots
node scripts/generate-store-kit.mjs --banner   # banner only
node scripts/generate-store-kit.mjs --screens  # screenshots only, from the live site
node scripts/generate-store-kit.mjs --verify   # check the files on disk, capture nothing
```

Every run ends by checking the kit: the banner must be exactly 1200 × 600, and each screenshot exactly 1080 × 1920 and under 3 MB. Any failure exits non-zero. This release's new controls (Delete account, Report and Hide plans from this author) show only when signed in or on a shared plan, and no capture shows the footer, so these screens stay accurate once it deploys.
