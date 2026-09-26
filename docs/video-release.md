# Current contribution demonstration additions

Two narrated September 20 current-application recordings are available at `/demo`: `first-minute.mp4` and `technical-proof.mp4` under `/videos/release-20260920/`. Each permanently labels its catalog/quote responses as controlled fixtures and states that no funds moved. Captions, readable transcripts, posters, exact durations and hashes accompany them in that directory's manifest. Their narration, and the narration on the September 19 walkthrough and the September 21 sponsor rehearsal, was added on September 26, 2026 as a 48 kHz stereo AAC track generated locally with the macOS Samantha voice from each film's caption cues, so the spoken words and the captions match exactly; the picture of every film is unchanged. Reproduce with `node scripts/record-contribution-release.mjs` against the local production server. They preserve the original narrated films and the September 19 recovery rehearsal.

The first-minute recording demonstrates explicit starter selection, exact budget, estimates, mint provenance and the honest purchase gate. The technical recording demonstrates micro-USDC remainder handling, provenance, original quote time/expiry and fresh re-estimation. It then switches to clearly labeled explanatory slides showing metrics from the separate [unsigned mainnet evidence](releases/2026-09-20/unsigned-semantic-proof.json), raw/scaled context and the source flow for semantic validation, durable signature-before-submit and unknown-state recovery. These slides are not app receipt screens or a claim that the controlled UI performed the simulation.

> Current contribution implementation and release status: [September 20 contribution release](contribution-release-20260920.md). Earlier dated observations below remain historical.

# Lotline video releases and fixture walkthrough

**Last updated:** September 20, 2026. Original narrated films: September 12.

## September 19 capture, published September 20

The [new browser walkthrough](https://lotlineonsolana.vercel.app/demo#controlled-demo) shows reviewed fees, two confirmed legs followed by an unknown third, reload/reconciliation, completion of the remaining leg, historical receipts and manual reminders at desktop and phone widths. It carries a visible **controlled fixture / mocked wallet and providers / no funds moved** label. It is narrated browser evidence of the review and recovery flow with a mocked wallet. Application release `bae159d` publishes it on the public demo page with a poster, download and text description; the [original capture and metadata](releases/2026-09-19/fixture-walkthrough/metadata.json) remain preserved.

The reproducible source is [execution-journey.spec.ts](../tests/e2e/execution-journey.spec.ts), specifically the four-leg walkthrough with `LOTLINE_RECORD_EXECUTION=1`. See the [continuation report](finish-report-20260919.md) for test results, transaction-validator limitations and the separate production status.

## Preserved September 12 films

These preserved September 12 product and technical films show that dated planner release, **832 Example identities** and plans with **up to ten assets**. Both use fresh **Ainsley narration generated through Higgsfield**, actual application recordings, English captions and text transcripts. The September 11 pitch, silent technical cut and hosted Scrimba explainer remain archives.

[Watch both films on the demo page](https://lotlineonsolana.vercel.app/demo). Production playback is part of the separately recorded [deployment verification](deployment.md); a successful local render does not establish hosted playback.

## Current files

| Film | MP4 | English captions | Plain-text transcript |
| --- | --- | --- | --- |
| Product | [product.mp4](../public/videos/release-20260912/product.mp4) | [product.en.vtt](../public/videos/release-20260912/product.en.vtt) | [product.transcript.txt](../public/videos/release-20260912/product.transcript.txt) |
| Technical | [technical.mp4](../public/videos/release-20260912/technical.mp4) | [technical.en.vtt](../public/videos/release-20260912/technical.en.vtt) | [technical.transcript.txt](../public/videos/release-20260912/technical.transcript.txt) |

The [machine-readable delivery manifest](video-release-manifest.json) records actual encoded durations, hashes, dimensions, codecs, narration provenance and caption details. Those measurements take precedence over the separate [115-second presentation outline](stocklana-demo-script.md), which is not a transcript or timing specification for these films.

## Completed media verification

Encoding completed on **September 12, 2026 at 16:01 UTC**. These are measurements of the delivered files, not target timings.

| Film | Duration | Narration | File size | Caption cues |
| --- | --- | --- | --- | --- |
| Product | **97.6 seconds** (1:37.6) | 93.58 seconds | 10,548,121 bytes | 42 |
| Technical | **164.5 seconds** (2:44.5) | 160.5 seconds | 15,621,229 bytes | 37 |

Both files are 1920 × 1080 at 30 fps, with H.264 video, AAC narration and a fast-start MP4 index. Full-frame FFmpeg decoding passed for both. Native rendering produced 2,928 product frames and 4,935 technical frames, with no diagnostics or compositor fallbacks. All 15 chapter preview frames were inspected for the current logo, readable text, correct mode labels and uncropped footage. The narration retains its natural speed; no time stretching was used. Narration begins two seconds into each film, and the caption tracks carry that offset.

These encode and visual checks do not substitute for browser playback on the deployed site. Production verification is recorded separately in the [deployment record](deployment.md).

## Editable sources

- [Source README and reproduction steps](../public/videos/release-20260912/source/README.md)
- [Native Higgsedit timeline](../public/videos/release-20260912/source/edit.mjs) and [media preparation script](../public/videos/release-20260912/source/prepare.py)
- [Current storyboard](../public/videos/release-20260912/source/storyboard.json) and [submitted narration](../public/videos/release-20260912/source/narration.json)
- [Eight original browser recordings](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/da40e070-7fa6-498e-9af0-34e1bd0808c8.zip)

The manifest records the three completed Ainsley audio jobs and their source URLs: one product take and two technical takes joined in their recorded order. It also pins hashes for the MP4s, captions, posters, transcripts and source files. The editable source requires those recorded media and narration inputs; it is not a self-contained native project ZIP.

## Production and accuracy

The visuals are fresh browser recordings of the real application and its existing decorative media. No generated app screen, invented wallet balance, quote or completed trade is presented as an observed result. The displayed Example calculations use synthetic practice data. Original fixture rates are retained for six assets; extra identities use the deliberately generic practice conversion described in the [catalog and Example documentation](../README.md#run-locally).

The real browser recordings were captured locally through Playwright against the production preview. Higgsfield generated the selected Ainsley narration with `seed_audio`; media preparation, native timeline composition and encoding ran in the Higgsfield cloud sandbox using Higgsedit and FFmpeg. Downloaded finished files are bundled with the application for same-origin playback. English captions follow measured word/segment timestamps, with product and protocol spellings corrected. The release manifest records actual jobs and output measurements.

No unrelated generated presenter or music track is added. The current Lotline mark, official issuer logos and selected decorative media retain their existing provenance. See [catalog attribution](xstocks-catalog.md), [decorative-media provenance](design-media.md) and the [MIT application license](../LICENSE). Source attribution is not a blanket license to redistribute third-party media.

The films distinguish synthetic Example footage from a separately dated read-only Live recording. The Live clip finished at **2026-09-12 15:37:11.765 UTC** and shows the Live mode, received AAPL/MSFT/NVDA estimates, and their source/expiry rows. Its composition is labeled **“Live capture · 12 Sep 2026 · quotes expire.”** No network-response JSON was saved for this recording; it is visual playback evidence, not an HTTP status or endpoint coverage report. The [earlier local finish checks](stocklana-finish-delivery.md) contain separate read-only provider evidence. Recorded Live values are observations at the capture time, not current prices when the film is watched.

Optional account features require their configured services; public email remains disabled pending verified custom SMTP delivery. Tokens.xyz enrichment is not presented as enabled. The product is an installable web application; neither film claims native app-store distribution, user traction, returns, transaction signing or a completed purchase.

## Preservation

- [Original pitch production](video/README.md#archival-pitch-production--september-11), [storyboard](pitch-storyboard.md#archival-54-second-pitch--september-11), native source, narration JSON and original captions are preserved as archival material.
- [Original silent technical film and Scrimba history](technical-video.md#archival-silent-technical-film--september-11), source scripts, OPML and delivery JSON remain unchanged. No private ownership-claim URL is published.
- The nine decorative video derivatives remain separate from spoken demonstrations. Their file hashes and decode checks are recorded in the [design-media manifest](design-media-manifest.json).

## Product transcript

You already know your xStocks and your split. Each new contribution still needs exact amounts and a plan for next time. This is Lotline, your next contribution, clearly. Start with Example mode. Explore 832 asset identities and build a plan with up to 10. The balances and estimates here are synthetic practice data. Never market prices. Choose your assets, set percentages, and enter your USDC budget. These percentages apply to this contribution, not your existing portfolio. Here, 50, 30, and 20% divide the amount exactly. Down to the final micro USDC. Inspect the calculation and verify this plan. Search for another company, adjust the split, and compare the exact contribution amounts. Copy the plan or download a CSV with its sources and freshness status. Switch to Live when you need current verification and amount specific estimates. Lotline checks issuer identities and Solana mints reads holdings and converts raw token amounts into displayed units. Jupiter provides route estimates that expire. Unavailable routes remain unavailable. Every quote belongs to a specific amount and expires within 30 seconds. Its source and time stay visible, so an estimate cannot quietly become a promise. Your budget and split stay saved on this device. Change the amount next time and the old estimates clear. Optional accounts add named cloud plans. The installable app keeps Example planning available offline. You can try the full planning flow before creating an account. When ready, copy the exact amount and verified mint. Then review independently on official Jupiter. Lotline never signs or executes a trade. One contribution accounted for. A familiar plan to return to.

## Technical transcript

Lotline turns a chosen xStocks split into an exact plan for the next USDC contribution. The current release supports 10 assets per plan, with 832 identities in its bundled Example catalog. This walkthrough uses the real application, and clearly labeled synthetic estimates. The calculation boundary is explicit. USDC is parsed into integer microunits and percentages into basis points. Big integer arithmetic calculates each allocation, then the largest remainder method distributes leftover microunits deterministically. The total always matches the entered budget. Invalid percentage fields never produce a complete allocation badge. Example is isolated from Live providers. The original six practice assets keep their fixtures. Additional identities use zero illustrative holdings and a generic unit estimate. The catalog includes pinned decimals and official logo assets, while unsupported saved mints remain visible for repair instead of silently replacing a user's draft. Live has a separate verification path. Issuer metadata identifies each asset, then Solana account checks verify its mint and token program. Token-2022 scaled UI Amounts require the current mint configuration and chain time. Raw holdings and quote outputs go through that conversion before display. Decimal formatting alone would be incorrect. The server requests amount specific Jupiter quotes in bounded batches of 3. It requests no transaction and supplies no signing wallet. Each result keeps its own retrieval time and expiry. With a 30 second maximum freshness window. Later batches cannot refresh earlier quotes. Provider failures and missing routes remain explicit states. Copy and CSV exports preserve exact allocations, verified mints, quote sources, and expiry. An export records whether an estimate was fresh or stale when exported. Copying never renews a quote. Editing the budget or percentages clears estimates so amounts cannot reuse a mismatched result. Device drafts keep the contribution budget and split. Signed in users can explicitly save named plans through Supabase, protected by row level security. Public offline caching excludes private account and API responses. Example calculations work offline, while Live estimates require a connection. Email delivery remains disabled until a custom sender is configured. The responsive web app is installable on supported mobile and desktop browsers. It is a contribution planner, not a broker or automatic trader. Users review any purchase independently on Jupiter. Lotline makes the numerical plan repeatable and its Live assumptions inspectable.

## September 19 scope update

The demo page now dates these films explicitly. Their original files, captions, transcripts, posters and editable sources remain unchanged. Later manual-reminder, prefilled Jupiter and execution review and recovery changes are documented in the [finish report](finish-report-20260919.md). Any new execution walkthrough uses a fake wallet and mocked providers, is labeled as a local fixture, and does not establish a real purchase.
