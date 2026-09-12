# Lotline — focused Stocklana finish delivery

**Historical local checkpoint.** The later authorized deployment and refreshed films are recorded in [release verification](release-verification.md). The local-only statements below describe this earlier checkpoint.
This is a local finish of the existing contribution planner. The prior uncommitted L1/L4/L5/L6 redesign is preserved. No source was pushed, no deployment or hackathon submission was made, and no production database, configuration, email or account was changed.

## Completed changes

- **832 Example assets:** reuse every identity, mint precision and official logo in the reviewed September 12 snapshot. Preserve the original six fixture calculations and the three-asset 50/30/20 walkthrough. The other 826 use zero illustrative holdings and a generic one-unit-per-100-USDC conversion. These are explicitly synthetic practice values, not current prices, routes, balances or halt observations.
- **Repeat contributions:** the device status identifies an editable draft; the budget helper distinguishes saved inputs from temporary estimates. Expanded Example choices survive reload and Live/Example changes. Even an unsupported nonempty draft is preserved for explicit repair rather than silently replaced by the default.
- **Percentage feedback:** invalid fields cannot produce a green complete badge. Valid numeric totals show the exact percentage left to assign or over 100%. The allocation algorithm is unchanged.
- **Honest exports:** CSV and copied text now carry source, effective expiry, status at export and a single export timestamp. Expiry is the earlier of provider expiry and 30 seconds after retrieval. Historical stale values remain labeled stale; invalid timestamps suppress units. Original quote times and exact allocations remain intact; exporting makes no request and cannot refresh a quote. The first eight CSV columns remain in their original order.
- **Submission consistency:** current documentation distinguishes ten plan assets from three-item request batches, the dated 832-asset snapshot from liquidity, all three migrations, and current local changes from hosted history. Existing films/captions remain intact; nearby copy labels their earlier cut and the product transcript again matches its spoken three-asset wording.
- **Prepared materials:** [submission draft](stocklana-submission.md), [115-second demo script](stocklana-demo-script.md), [human usability guide](usability-test-guide.md), and [short/full descriptions](product-description.md). Team/contact/release placeholders remain for the team. No human feedback, traction, affiliation or submission is invented.

## Evidence boundaries

| Capability | Evidence class | What it establishes |
| --- | --- | --- |
| Expanded Example, exact contribution math, returning drafts and exports | Implemented locally | 241 unit/integration tests and 65 production browser tests passed; fresh Example/offline captures below |
| Quote batches, raw holdings + quote conversion, real refraction, auth isolation and PWA boundaries | Preserved; verified locally | Existing meaningful suites retained; prior checkpoint is separately dated in [redesign delivery](redesign-delivery.md) |
| Password sign-in, cloud CRUD, forced owner RLS and deployed quote smoke | Historically verified hosted | [Account history](accounts.md) and [integration record](integration-verification.md), not a fresh test of this release |
| Public homepage and six-asset Example | Currently verified hosted, read-only | September 12 at 12:51:10 UTC: HTTP 200, earlier homepage, no Kova marker, six Example choices, no browser errors |
| This finished source on the public origin | Not deployed | The public site does not contain this local release |
| Public signup/recovery and authenticated Tokens.xyz context | Externally blocked | Verified custom SMTP delivery; separately approved API access, server key, activation terms/quotas |

The public page observation is at `work/stocklana-finish/hosted-observation.json` outside the repository. It did not sign in, save a plan or request a quote. Existing production provider coordination remains untouched. Local provider smokes use `SUPABASE_SECRET_KEY=''`, `LOTLINE_SHARED_LIMITS=false` and `VERCEL=0`, so they do not verify multi-instance coordination or reserve production database slots.

## Verification

All required source gates passed on the finished code: `npm run lint`, `npm run typecheck`, `npm test` (**241 passed; one explicitly opt-in live test skipped**) and `npm run build`. All 18 static pages were generated; dynamic planner/API routes remain. Local Next build ID: `YN40d0rJh_aIU8u2t21Zc`. The Git base remains `8914b88` with the preserved and completed changes uncommitted.

The full production browser run passed **65/65 tests in 2.4 minutes**, including every requested existing suite and the five new regressions. Those cover mobile additional-asset search/logo/estimates without providers, a ten-asset returning contribution/export, exact percentage feedback, unsupported-draft preservation, and stale copy/download status. No test was weakened to conceal a failure. Logs: `work/stocklana-finish/final-verify.log` and `final-browser.log`.

Code, TypeScript and security reviews approved the finish delta with no material findings. The earlier redesign/auth/Tokens review remains separately recorded; no auth or provider contract was replaced in this pass.

A fresh **local read-only** smoke ran from **2026-09-12 13:22:55.690 to 13:23:08.706 UTC**. It returned HTTP 200 with 832 verified catalog assets and zero exclusions, a successful holdings read for the independently public AAPLx mint authority, a successful 10-USDC AAPLx Jupiter quote, and successful conversion of raw holdings plus raw quote output. Exact mint, retrieval/expiry times, normalized results and the explicit lack of taker/signing/submission are in `work/stocklana-finish/live-smoke.json`. This is dated route evidence, not a current price or a guarantee of all-asset liquidity. Production database reservation was disabled locally; multi-instance coordination was not freshly tested.

At **13:35:12 UTC**, a separate real offline reload restored a ten-asset draft drawn from the end of the expanded catalog, changed its budget to 20.000001, and exported all ten mints with the exact 2.000001 remainder allocation. It produced no page errors and cached no private/API paths. Evidence: `work/stocklana-finish/expanded-offline.json`; usable CSV: `outputs/lotline-stocklana/expanded-offline-example.csv`.

Fresh screenshots at 1440×1000, 390×844, 844×390 and 720×500 have no horizontal overflow or page errors. The last viewport represents 1440×1000 at 200% browser zoom; keyboard, reduced-motion and real refraction/lifecycle checks passed in the browser suite. The original product and technical films decoded at 1920px, advanced, sought to 15 seconds and retained native controls, unmuted playback state and respectively 13/12 caption cues. Durations remain 54/160 seconds. Every frame of all nine unchanged decorative derivatives was decoded again and its recorded hash verified. Evidence: `outputs/lotline-stocklana/capture-verification.json` and `work/stocklana-finish/media-verify.log`.

Preserved source-media hashes and lifecycle constraints are documented in [design media](design-media.md) and its [manifest](design-media-manifest.json). Original brand, favicons, PWA icons, nine decorative derivatives and two existing films have not been replaced by this finish pass. Offline math supports the expanded catalog; the bounded existing offline preload still guarantees the original six logos. Other uncached logos use the existing initials fallback while disconnected.

## Local preview and artifacts

From the repository, use Node 22+ and npm. Preserve an existing ignored `.env.local`; `.env.example` contains placeholders only.

```sh
npm ci
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run dev -- --port 3111
```

For the production preview used in browser/PWA verification, stop that development server and run sequentially:

```sh
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run build
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run start -- --port 3111 --hostname 127.0.0.1
```

Open `http://127.0.0.1:3111/app?mode=example`. The public website is a different, earlier version. Final screenshots, the real browser motion capture, and normalized evidence are in `outputs/lotline-stocklana/` and `work/stocklana-finish/` outside the repository. Main artifacts: `home-desktop.png`, `home-mobile.png`, `planner-desktop.png`, `planner-mobile.png`, `planner-landscape.png`, `planner-zoom-200-equivalent.png`, and `lotline-finish-motion.mp4` (also WebM). The 24.44-second silent H.264 capture (3.39 MB, fully decoded after encoding) shows the Example calculation, additional-asset search, saved changed budget and real glass scene; it is distinct from the prepared narrated 115-second script. Baseline patches and an archive of the initial untracked work were saved in the latter directory before implementation.

## Remaining external actions

1. Review team/member/contact/release details and the official authenticated submission form. The [dated official check](stocklana-check.md) confirms the September 18, 4pm Eastern deadline (September 19, 03:00 Vietnam) and supplied rubric; authenticated fields were not inspected.
2. Record the prepared 115-second narration/script if desired. Existing product/technical media and the new local motion evidence remain available; a new narrated pitch is not claimed.
3. Separately authorize publishing the reviewed source/release and reverify the exact deployed build. This task does not publish or submit anything.
4. For public email signup/recovery, configure Supabase SMTP host/port/username/password/verified sender, confirm provider DNS requirements, then test real confirmation/recovery delivery and exact callback redirects. Only then set `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` and rebuild. Existing-account auth and guest planning remain independent.
5. To enable supplementary Tokens context, obtain approved `assets:read` access, set server-only `TOKENS_XYZ_API_KEY` and `TOKENS_XYZ_ENABLED=true`, confirm applicable display terms and quotas, and perform an authenticated smoke. The verified adapter remains implemented and disabled, with fixtures confined to tests.

No real hosted account/RLS retest, email delivery, authenticated Tokens request, purchase or trade is represented by local fixtures or earlier hosted evidence.
