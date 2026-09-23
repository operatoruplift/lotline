# Landing motion and production integration checks

Canonical site: https://lotline.dev. This record distinguishes local motion verification from read-only checks of the production release already serving on September 23, 2026.

## Changes

- [`4313169`](https://github.com/operatoruplift/lotline/commit/4313169e0893acea0fe7fab6f316864da575bca8) adds bounded decorative depth driven by native scrolling. Hero media, previews, feature media, support media and the landing footer use separate transform layers. Scroll handling is passive and batches layout reads before transform writes; the viewport itself is not repositioned. Motion strength drops to 35% at widths of 800px or less.
- Entrances use shorter translations and durations, cap stagger at 160ms, and remove stagger on smaller screens. Content is hidden for an entrance only after JavaScript enhancement is ready. Keyboard focus immediately exposes its containing reveal. Reduced-motion changes remove scroll transforms and leave content visible.
- Decorative videos assign a source within 280px of the viewport so the next scene can decode before entry. Playback still requires actual visibility, connectivity and allowed motion. Mobile source selection remains one-time; posters remain available when playback is unavailable or disabled.
- The first production run confirmed that Next's streamed page still needs its inline JavaScript swap even when the page is statically built. The loading component now supplies a clear JavaScript-disabled instruction and reload link instead of leaving the opening indicator visible. A separate production-only test blocks hydration and animation bundles while allowing the inline swap, to verify that server content and links remain usable before enhancement. Full JavaScript-disabled application support is not claimed.

These commits concern landing motion and media behavior. They do not activate provider credentials, change purchase access or establish a settlement.

## Local verification

Completed local checks:

| Check | Result |
| --- | --- |
| ESLint | Passed |
| Canonical TypeScript check | Passed |
| Unit suite | 512 passed; 2 opt-in live tests skipped |
| Layout, native scrolling and motion-preference browser cases | 5 passed on the development server at `http://127.0.0.1:3140` |
| Decorative-media browser cases | 5 passed on the same development server |
| Production regression run at `2cc830a` | 113 browser cases passed; the original no-JavaScript expectation failed consistently, exposing the existing stream dependency |
| JavaScript-disabled fallback and unavailable client-bundle checks | Both passed in final production CI and on the public domain; the instruction also passed locally in development |

The browser checks cover responsive depth bounds, usable navigation, focus visibility, preference changes, media preparation before entry, playback visibility and poster behavior. A subsequent production build also completed locally, and both native-scroll cases plus the blocked-client-bundle case passed against it (3 cases, no retries). Fixture tests and media checks are not live provider or purchase evidence.

Screenshots from the local production build: [desktop hero](screens/landing-hero-1440.png), [desktop features](screens/landing-features-1440.png), [phone hero](screens/landing-hero-390.png), [phone features](screens/landing-features-390.png).

## Hosted observations before the motion release

Read-only checks ran against https://lotline.dev at **2026-09-23 04:19–04:20 UTC**. These observations verify the then-current hosted application, not deployment of the motion commits above.

| Resource | Observed result |
| --- | --- |
| `/`, `/app?mode=example`, `/pre-ipo`, `/demo`, `/brand-kit`, `/privacy` | HTTP 200 with the expected page titles |
| `/api/prestocks/assets` | HTTP 200; `state:success`; 8 verified assets; 0 unavailable |
| `/api/execution/config` | HTTP 200; `state:configuration-required`; `enabled:false`; `reconciliationAvailable:true` |
| `/api/market-reference` | HTTP 200 from one read-only POST containing the three pinned xStock mints; `state:configuration-required`; no equity or token observations; no USDC/USD observation |
| `/demo` release copy | Contains the September 23 planning-benchmark explanation and the disclaimer that the dated rehearsal shows the earlier unavailable-state flow |
| Demo media links | All 21 linked resources returned HTTP 206 to bounded range requests: 6 MP4s, 6 posters, 5 caption files and 4 text descriptions; expected content types and nonempty resource sizes |

The eight verified PreStocks symbols were ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET and SPACEX. No fresh quote request was included in this check. Media range responses establish link availability and byte serving, not full playback or a newly recorded live-integration demonstration.

## External configuration and limits

Pyth returned: “Pyth price access is not configured. Your Jupiter estimates remain available.” Purchase configuration explicitly reported that in-app purchases are unavailable and that users can plan and review independently on Jupiter. Receipt reconciliation being available does not establish a completed purchase.

The earlier September 23 authenticated environment audit found no `PYTH_API_KEY`, `JUPITER_API_KEY`, `LOTLINE_EXECUTION_ACCESS_POLICY` or `LOTLINE_EXECUTION_ALLOWED_WALLETS`. This read-only hosted check did not inspect or change environment variables. Current HTTP responses confirm missing Pyth access and closed purchase gates; they do not independently identify every missing variable. See the [review release](release.md) and [planning-benchmark release](quote-benchmark.md) for integration semantics and prerequisites.

No wallet was connected, no order requested, no transaction signed or submitted, and no funds moved during these checks. Authenticated Pyth observations, reviewed execution access and a separately authorized real settlement remain unverified.

## Motion release identity and final checks

- [PR #5](https://github.com/operatoruplift/lotline/pull/5) merged to `main` as `58b3f42bd883b3c33b59ee4dfa39a0de9c75a31b`.
- [Final CI run35819328628](https://github.com/operatoruplift/lotline/actions/runs/35819328628) passed lint, typechecking, the production build, **512 unit tests** and **115 browser tests without retries**. Two opt-in live unit tests were skipped. Checked revision `2738b72deed76224cc3af11d07bfc147a95672a1` and the merge have the identical source tree `9181fda9526404335684e14cb4d4764715dd7b12`.
- Vercel deployment `dpl_CfgVihQbuJMzq5WpoBCSegF1ZQH8` is **READY**, built from that merge and assigned to `lotline.dev`. [Deployment evidence](landing-deployment.json) records the source, aliases checked and CI identity. Subsequent evidence-only commits may redeploy the same application source.
- All **5 focused browser tests passed on https://lotline.dev**, with no retries: desktop/phone native scrolling and planner navigation, dynamic motion preferences, the disabled-JavaScript instruction, and readable content when client bundles cannot load. Public-site screenshots: [desktop](screens/landing-live-hero-1440.png), [phone](screens/landing-live-hero-390.png).
- [After-release HTTP evidence](landing-hosted.json), observed at04:52:37UTC, confirms six pages200, current demo copy and eight verified PreStocks assets. Pyth remains configuration-required and in-app purchases remain disabled. No real settlement was performed or claimed.
