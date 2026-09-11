# Lotline technical explainer

[Watch the narrated technical video](https://scrimba.com/explain/guide00s6b8rut?fullscreen=1)

**Length:** approximately 2 minutes 50 seconds. **Format:** a hosted Scrimba explainer with 15 narrated slides, original architecture diagrams, a largest-remainder animation, and exact excerpts from the Lotline repository. The video is unlisted; the provider states that viewers do not need an account.

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

Manual player playback was not available in this agent environment: computer-use reported no available browser, and the public player page rejected the non-browser HTTP client. The card also exposes an undocumented `complete: false` field, which is recorded in [technical-verification.json](video/technical-verification.json) rather than interpreted as a successful playback check. The stream itself is finalized according to the creation provider. The deliverable is a hosted narrated explainer, not an exported MP4 file.

## Accuracy boundaries

The live evidence is explicitly dated September 11, 2026, 16:12 UTC. It came from a real production-UI quote smoke, with confirmed zero balances at an independently public test address. It is not represented as current pricing or proof of a nonzero real-wallet path. Fixture coverage is described separately.

The account and PWA sections describe implemented source behavior. The narration explicitly states that hosted accounts need a configured Supabase project, applied migrations, and working email delivery. It makes no claim that all hosted production integrations have passed, and it does not imply App Store distribution. No transactions were signed or submitted.

The public video link deliberately omits the private ownership-claim parameter.
