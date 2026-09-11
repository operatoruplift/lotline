# Lotline technical walkthrough

[Watch or download the public technical MP4](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/73bd8c85-4fb7-4ba5-8b07-dd9eab8db488.mp4) · [Editable Higgsedit project ZIP](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/470178d4-2c27-4b87-99b4-98904698449f.zip) · [Contact sheet](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/194ecde7-127b-4e0f-9634-92ff16ab3ab8.png)

The public video is **2 minutes 40 seconds, 1920 × 1080, 30 fps**. It uses native motion graphics, readable code excerpts, and actual Lotline Example screens. This cut is silent with complete on-screen explanations; [English scene-summary captions](../public/videos/technical.en.vtt) accompany the web player.

Its 12 chapters cover the read-only boundary, browser/server architecture, BigInt parsing, largest-remainder allocation, issuer and mint identity, scaled units, quote-only Jupiter requests, stale-response isolation, account ownership, offline PWA behavior, dated verification evidence, and export handoff. The Live evidence in this cut is explicitly dated September 11, 2026, 17:23–17:24 UTC.

The native render completed with 4,800 frames and no diagnostics or compositor fallbacks. The source passed ESLint and a separate source review. The editable project and all required Example images are included in the ZIP; the reusable source is [technical.mjs](video/technical.mjs). Exact file metadata, chapter timing, and verification status are recorded in [technical-delivery.json](video/technical-delivery.json).

## Separate narrated interactive explainer

[Scrimba interactive explainer](https://scrimba.com/explain/guide00s6b8rut?fullscreen=1) — this claim-stripped link may require account access. The private owner link is provided separately and is not committed to the repository. Public MP4 media is linked from the project README.

**Player length:** approximately 3 minutes 15 seconds (the provider estimated 2:50 of narration before playback). **Format:** a hosted Scrimba explainer with 15 narrated slides, original architecture diagrams, a largest-remainder animation, and exact excerpts from the Lotline repository. Visibility was requested as unlisted. Account-free playback was verified using the original private owner URL; removing its claim parameter produces a locked player.

The authored source is [technical-explainer.opml](video/technical-explainer.opml). The original editorial outline is [technical-video-script.md](technical-video-script.md). This source-based explainer is separate from the browser demo and the Higgsfield pitch video.

## Chapters

1. The contribution-planning boundary: choose, estimate, review.
2. Browser, Next.js route handlers, issuer metadata, Solana RPC, and Jupiter.
3. String-to-BigInt micro-USDC parsing and integer basis points.
4. Largest-remainder allocation, animated with 10.000001 USDC at 50/30/20.
5. Issuer identity, mint checks, every token account, chain clock, and official scaled-unit conversion.
6. Jupiter quote-only inputs, no taker, no execute call, and 30-second freshness.
7. Verified account sessions, explicit cloud saves, ownership RLS, and shared provider limits.
8. Synthetic offline Example and network-only Live/private requests.
9. Deterministic coverage versus the dated real quote observation.
10. Copy/CSV/source handoff and independent review on Jupiter.

## Completion and verification

The provider's `finish_explainer_stream` returned **“Explainer finished”**, guide `guide00s6b8rut`, with 15 narration blocks. Its recorded narration budget was 170,322 milliseconds. The public card endpoint returned HTTP 200 and the title **“Lotline: exact xStocks planning”** with status **“15 slides · 3 min”**, without authentication.

The OPML was parsed successfully. All 15 slides have narration; both follow-up nodes are present; every referenced anchor, source line, and exact code selector resolves. No credentials or environment values appear in the video.

Manual playback was subsequently verified in the browser through the original private owner URL, without logging in. The parent agent observed all 15 slides, real code, and the transcript, then pressed Play and observed narration advance from 0:00 to 0:20. The player displayed 3:15 duration (the summary rounded to 3:16). The claim-stripped URL instead showed a locked explainer and a login requirement. The undocumented public-card `complete: false` field is therefore not used as a playback result. These observations are recorded in [technical-verification.json](video/technical-verification.json).

## Accuracy boundaries

The live evidence is explicitly dated September 11, 2026, 16:12 UTC. It came from a real production-UI quote smoke, with confirmed zero balances at an independently public test address. It is not represented as current pricing or proof of a nonzero real-wallet path. Fixture coverage is described separately.

The account and PWA sections describe implemented source behavior. The narration explicitly states that hosted accounts need a configured Supabase project, applied migrations, and working email delivery. It makes no claim that all hosted production integrations have passed, and it does not imply App Store distribution. No transactions were signed or submitted.

The repository deliberately omits the private ownership-claim parameter. Do not publish that parameter to make the interactive link public; use the public MP4 deliverable for unrestricted sharing.
