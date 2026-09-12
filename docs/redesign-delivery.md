# Lotline local redesign and reliability delivery

This change integrates L1 Kova, L4 Veloce, L5 Heritage Grove and L6 Liquid Glass into the existing Next.js application. It retains the current branch-shaped Lotline mark, favicon, verified asset catalog, ten-asset plans and existing routes. The work is local: no Git push or deployment is included.

## Phase 1 — Design implemented

- Cream/forest editorial homepage with the requested heading and three previews derived from the existing 1,000 USDC example: Apple 500, Microsoft 300, NVIDIA 200. No fictional returns, prices or token units.
- Original hero encoded as a complete 20.08-second forward/reverse journey; mobile and desktop derivatives preserve natural timing.
- Three Veloce video cards with 450/350/450px desktop minimum heights, 40px corners and aligned bottoms. The previous duplicate feature grid is replaced.
- Square supporting film alongside the existing three educational steps; precision, share, install and user-control explanations remain.
- Supplied landscape footer with copy in its quiet sky. At 1,100px and below, the 16:9 artwork follows the copy in normal flow.
- Existing optional account screens use real video-pixel WebGL refraction beneath native controls. Rendering is limited to 24fps, 600,000 output pixels and a 960px source texture. It handles cover coordinates, resize, offscreen/background pause, cleanup, rejected playback and unavailable graphics.
- One persisted motion preference governs CSS motion and decorative media. Device reduced-motion changes take effect immediately. Paused entrances remain readable. Only visible scenes receive video sources; no decorative video is fetched while offline.
- A real footer still is added to the public offline cache. Videos, auth pages, private plans and API responses remain outside it.

The supplied font references did not provide an approved usable font asset in this checkout. Editorial headings consistently use the documented Georgia/system serif fallback; controls retain the existing system sans and tabular numerals. No remote font dependency or unverified font file was added.

Media provenance, source/output hashes, sizes, full decode verification and boomerang frame-order evidence are in [design-media.md](./design-media.md) and [design-media-manifest.json](./design-media-manifest.json).

## Preservation map

| Existing behavior | Result |
| --- | --- |
| Home, planner, how-it-works, demo, privacy and account routes | Retained; marketing composition adapted |
| Make a plan, Example, demo, sign-in, install, help, privacy and GitHub links | Retained in coherent navigation/content/footer |
| Current logo, favicon, PWA icons and issuer logos | Retained unchanged |
| Ambient orbs/grid, underline, floating previews, signal, split bars/sheens | Retained in scoped home styles; entrance and float transforms use separate wrappers |
| Three-step meters, continuity connector, device pulses, intent arrow | Repositioned beside their original explanations |
| Lower-section reveals | Once in view; pause/resume does not create a new reveal instance |
| Existing route loader and hover feedback | Retained; shared pause/reduced-motion policy applies |
| 54s narrated product film and 160s silent technical film | Original source URLs, audio behavior, native controls, captions, transcripts and technical anchor retained |
| Live / Example / public offline Example | Retained and explicitly distinguished |
| Budget/weights, add/change/remove, even split, ten assets, three-item API batches | Retained |
| Exact BigInt allocations, scaled Token-2022 units, raw projections | Retained |
| Read-only public wallet, quote-only Jupiter, external trade review | Retained; no signing or execution added |
| Local draft, share-review consent, CSV/text export, mint/amount copy | Retained |
| Optional cloud save/load/delete/sign-out and owner boundaries | Retained with expired-session and cancellation repairs |
| Existing API contracts | Retained; optional context is a separate new route |
| Install/offline, focus/keyboard, skip link, error states | Retained and exercised |

## Phase 2 — Reliability implemented

- Cloud401 responses clear private account/list state and invalidate pending responses before reading the response body, including non-JSON errors. The local draft remains intact.
- Form continuations use a request generation and a synchronous submission lock; obsolete requests cannot reset the form or navigate. A scoped, serialized Supabase transport also stops cancelled response payloads before the SDK can persist stale cookies. It bounds response size and deadlines, waits for prior SDK cleanup before a newer account operation, and orders explicit recovery checks and sign-out while keeping background refresh independent of form cancellation. Real-SDK tests verify that a delayed account A cannot overwrite account B. Native forms use POST so a pre-hydration submission cannot place credentials in a URL.
- Issuer checks that age past 30 seconds while waiting for provider coordination fail closed. Quote timing includes upstream latency, and sequential balance snapshots are dated from the beginning of acquisition rather than the end.
- Existing provider limits, exact identity matching, stale/no-route behavior, owner filtering/RLS definitions, safe callbacks and SMTP readiness remain in place.

Live read-only verification on the local application returned 832 verified assets with no unavailable entries, a successful independently public-address balance read, and a successful amount-specific Jupiter quote with scaled units. Local provider coordination was explicitly disabled for this verification; it did not need a production database reservation. No transaction was signed or submitted. Evidence is in `work/redesign-qa/live-reads.json` outside the repository.

Email signup/recovery remain honestly gated by `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false`. Existing-account sign-in remains available. Mocked tests and readiness tests cover the available handlers without sending email or changing an actual account. Live email delivery, a real password-reset round trip, and a real two-user cloud/RLS exercise were not performed in this redesign task. The SQL owner policies and API filters were reviewed; this task did not apply or change production SQL. Earlier hosted verification remains separately dated in [accounts.md](./accounts.md).

To activate email flows, configure the Supabase project's custom SMTP host, port, username, password, verified From address and sender name; satisfy the mail provider's domain-verification requirements; and verify confirmation and recovery delivery through the intended origin with its exact callback URLs allowed. Only then set `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` and rebuild. No SMTP credentials or readiness settings were changed here. [Existing setup instructions](./deployment.md) describe these settings.

## Phase 3 — Optional Tokens.xyz context implemented

A compact disclosure in the results panel offers one selected verified asset and an explicit **Load asset context** action. Editing budgets, weights or the dropdown does not call Tokens. Example mode does not expose provider fixtures as live data. Changing the selected mint cancels and discards the previous request.

The server adapter uses the verified official contract, exact Solana mint matching, strict validation, a fixed upstream origin, bounded response streaming/deadlines/retry/queue/cache and safe source links. It never imports canonical prices or another variant's liquidity. Original provider times are retained; stale or undated liquidity is omitted, including when an already-open panel crosses its freshness deadline. Metadata never renews a quote.

**Activation is external and remains disabled:** approved API access, an `assets:read` key in server-only `TOKENS_XYZ_API_KEY`, and `TOKENS_XYZ_ENABLED=true`. Neither a key nor approval to activate hosted enrichment was supplied. The API contract is verified; the blocker is credentials/access, not an unknown API. Key-specific quotas and multi-instance enforcement must be confirmed before public activation. See [tokens-enrichment.md](./tokens-enrichment.md) for official documentation, timestamp semantics, terms and activation details.

## Verification and artifacts

The baseline and final browser evidence are stored outside the repository so generated screenshots and captures do not become application dependencies:

- `work/redesign-baseline/`: original home/planner/sign-in/demo desktop and mobile screenshots plus baseline observations.
- `outputs/lotline-design/home/`: desktop, 390px mobile, short landscape, 200% zoom-equivalent screenshots, focused feature/footer captures and a 16.52-second MP4 of real browser motion.
- `outputs/lotline-design/auth/`: desktop/mobile/landscape/200% screenshots, pixel/geometry evidence and 9.56-second glass motion capture.
- `work/redesign-qa/accessibility.json`: no overflow or WCAG A/AA violations across home, sign-in and Example at 390×844, 844×390, 720×500 and 1440×1000.
- `work/redesign-qa/demo-playback.json`: actual 1920px decoding, playback/time advancement, seeking to 15 seconds, controls, unmuted behavior, 13 product caption cues and 12 technical cues. Durations remain 54/160 seconds.

The 720×500 CSS viewport represents a 1440×1000 display at 200% browser zoom; the account evidence additionally exercises CSS zoom. Browser checks cover video failure, reduced preference changes, persistent pause, navigation cleanup, actual refraction readback, account isolation, incoming-share review, offline math/export and the planner's error states.

Final source gates passed: `npm run lint`, `npm run typecheck`, `npm test` (**226 passed; one explicitly opt-in live test skipped**) and `npm run build` (all 18 static pages generated, dynamic routes retained). The skipped test is not counted as live integration evidence; the separate read-only 832-asset/holdings/Jupiter smoke checks are described above. The full gate output is `work/redesign-qa/final-verify.log`.

The final production browser run passed **all 60 tests in 9.2 minutes** using `E2E_BASE_URL=http://127.0.0.1:3111 npm run test:e2e`. It covered all existing planner/state/share/draft/cloud/judge/PWA journeys plus optional context, the real SDK's cookie/account isolation, media playback and WebGL refraction. Phone/tablet/desktop accessibility, iPhone installation and public-only offline checks passed. Auth/provider failure fixtures remained intercepted; these are not claimed as hosted email or authenticated Tokens checks. Output: `work/redesign-qa/final-e2e.log`.

Code, TypeScript and security reviews approved the final local scope. Findings fixed during review included paused entrance visibility, rejected enrichment-body cleanup, displayed liquidity aging, and the Supabase SDK's stale-session persistence race. The final auth re-review checked recovery cleanup, password updates and sign-out ordering against the installed SDK. The dependency audit returned zero vulnerabilities.

## Local launch

From the repository:

```sh
npm ci
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run dev -- --port 3111
```

For a production preview independent of production database request coordination:

```sh
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run build
SUPABASE_SECRET_KEY='' LOTLINE_SHARED_LIMITS=false VERCEL=0 npm run start -- --port 3111 --hostname 127.0.0.1
```

The preview opened for this task is `http://127.0.0.1:3111`. Existing ignored environment values are not published. `.env.example` contains names/placeholders only. The public Supabase URL/key configure optional account UI; server RPC/Jupiter variables support live reads. Email readiness and Tokens enrichment are independent gates.
