> Current contribution implementation and release status: [September 20 contribution release](contribution-release-20260920.md). Earlier dated observations below remain historical.

# September 12 release verification

The finished Lotline app and refreshed films are deployed at **https://lotlineonsolana.vercel.app**. This release includes the selected L1/L4/L5/L6 design, current logo and favicon, all 832 Example identities, plans of up to ten assets, the saved-draft and exact-allocation fixes, and freshness-aware exports. Prior uncommitted implementation was preserved and included.

Production deployment **dpl_8mZD9ufC7c7qJjsS486NRfvPQAju** was created at **2026-09-12 16:19:43 UTC** and reached READY. [Deployment identity](releases/2026-09-12/deployment.json). The production alias and the earlier `lotlinesolana.vercel.app` alias both resolve to this release. Subsequent Git-linked builds can supersede the deployment ID; these records identify the exact production build observed below.

## Updated videos

| Film | Duration | Encoded size | Captions |
| --- | --- | --- | --- |
| [Product tour](https://lotlineonsolana.vercel.app/videos/release-20260912/product.mp4) | 97.6 seconds | 10,548,121 bytes | 42 English cues |
| [Technical walkthrough](https://lotlineonsolana.vercel.app/videos/release-20260912/technical.mp4) | 164.5 seconds | 15,621,229 bytes | 37 English cues |

Both films were newly narrated with the previously selected **Ainsley** voice through Higgsfield, and composed in Higgsedit from actual current application footage. They explain 832 Example assets, ten-asset plans, exact allocation, quote freshness, exports, saved drafts, cloud boundaries and independent Jupiter review. Example is labeled synthetic; recorded Live observations are visibly dated. The technical film now has narration. Neither film promises execution, email delivery, or market-price fixtures.

Both MP4s are H.264/AAC, 1920×1080 at 30 fps, faststart, fully decoded with FFmpeg, and below clipping. Natural narration was not time-stretched. All 15 chapter frames were inspected. The demo page uses versioned film, poster and caption URLs, native playback controls, matching complete transcripts and direct downloads. Original films, scripts and source records remain explicitly archival. [Film source and provenance](video-release.md) · [Measured manifest](video-release-manifest.json)

The nine approved decorative videos remain unchanged. Their hashes and full-frame decoding were verified again. Browser checks cover visible playback, offscreen pause, reduced motion, fallbacks, route cleanup and the mobile derivatives.

## Local verification

- ESLint, canonical TypeScript checking and production build passed.
- **241 unit/integration tests passed; one explicit opt-in Live test remained skipped.** Actual hosted Live checks are separate below.
- The full **67-test browser suite** initially passed 66 and exposed one selector matching a hidden Next streaming subtree. The test was corrected to use the single accessible banner; all three affected responsive checks then passed at 375/768/1440 pixels. No application change was needed.
- The two new video checks verify actual decoded video and audio, time advancement, midpoint seeking, all caption ranges, matching transcripts, native controls, mobile/desktop layout and Axe accessibility.
- Independent code, TypeScript, Python-source and security review found no material issue. Final type/lint and diff checks passed after test-only repairs.
- The first published CI run passed 66/67 browser checks and caught the iPhone installation audit sampling a footer fade before it finished. The test now waits for the actual animation to complete with normal motion intact, then runs unchanged Axe rules. Targeted local and hosted checks plus independent review passed. [CI animation diagnosis](releases/2026-09-12/ci-iphone-animation-evidence.json) records the first run and repair; the new commit receives a complete CI rerun.

Local logs are retained in the workspace at `work/deploy-video-release/local-verify.log`, `local-browser.log`, `responsive-check.log` and `decorative-media.log`. They are excluded from Vercel uploads. GitHub CI runs the same complete production verification on the published source; its eventual status is separate from these local records.

## Fresh deployed verification

| Scope | Result and exact limit |
| --- | --- |
| Live catalog, holdings, quote and conversion | **Passed, 16:22:22–16:22:46 UTC.** Catalog returned 832 assets; read an independently public AAPLx mint-authority address; requested one 10-USDC amount-specific quote; converted the raw combined amount into scaled display units. This exercised the deployed server configuration and required shared-provider coordination. No signing wallet or transaction was supplied. [HTTP evidence](releases/2026-09-12/hosted-live-smoke.json) |
| Current public UI | **Passed, 16:25–16:27 UTC.** Homepage, demo and Example returned HTTP 200 at 1440 and 390 pixels, with current logo/design, 832 Example choices and zero overflow or page errors. [Visual/browser record](releases/2026-09-12/hosted-visual-verification.json) |
| Published video identity | Both MP4s, posters, captions and transcripts match the reviewed local SHA-256 hashes exactly. Both videos support HTTP 206 byte-range responses. [Hosted hashes](releases/2026-09-12/hosted-media-integrity.json) |
| Hosted browser journeys | All **15 selected behaviors** passed across the initial run and targeted repairs: new film playback/audio/captions/seek, decorative motion, expanded Example, exact exports, ten-asset draft preservation, stale-copy behavior and PWA/offline math. The initial 13/15 run exposed two test selectors: a hidden streaming copy and an expected logo URL lacking Vercel's deployment query. Both were repaired without app changes; all four affected media/asset checks then passed. [Trace diagnosis](releases/2026-09-12/hosted-selector-evidence.json) |
| Account entry pages | Anonymous sign-in renders; signup/recovery correctly show the email-gated notice. No account was created or signed in during this release. Earlier owner/RLS tests remain historical, not newly verified here. |

The hosted Example and failure-state browser tests use isolated browser data and intercept selected provider requests. They are not evidence of all-market liquidity or authenticated account behavior. Only the distinct HTTP smoke above is fresh live-provider evidence. No email was sent, no trade was submitted, and no hackathon entry was registered.

## Configuration and release boundary

The existing Vercel project, domain and environment configuration were retained. Server keys were not printed or published. A new `.vercelignore` excludes environment files, test artifacts, generated route types and build caches from CLI uploads. New versioned film URLs avoid stale media references without expanding offline caching to large videos or private pages.

Public signup/recovery remain disabled until a verified custom SMTP sender and delivery tests are available. Optional Tokens.xyz context remains disabled pending approved API access and credentials. Guest planning, the 832-asset synthetic Example, live quote-only planning, installation and public offline Example work independently of those optional configurations. Native app-store packages are not part of this PWA release.

The [Stocklana submission draft](stocklana-submission.md), [presentation outline](stocklana-demo-script.md), and [usability guide](usability-test-guide.md) are ready for team details and submission review. No submission was made.
