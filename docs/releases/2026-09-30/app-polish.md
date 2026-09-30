# September 30 app polish

Status: implementation and focused local verification complete. CI found a production-only Pre-IPO navigation flag defect; its correction and final deployment verification are in progress. This follows the [earlier September 30 regression release](release.md).

## Product changes

- Desktop app navigation adds a direct Planner destination, groups the main sections together and clearly marks the current page with a sage pill. Compact spacing keeps the header usable between phone and wide desktop layouts.
- The phone and tablet tab bar becomes a bounded cream-and-sage dock with a visible Plan label. Its menu retains planner, market, community, PreStocks, shared-link and Example entry points. Keyboard opening, Escape dismissal and focus restoration remain supported.
- Community stays available when moving into Markets or the PreStocks planner. Both planners belong to Portfolio in the mobile navigation when Community occupies the fourth tab. Account screens identify their active destination.
- The existing brand, public landing header, financial calculations, account behavior and historical media are preserved. The user-owned `video/` workspace is untouched.

## Verified locally

All **10 focused browser tests passed**: six new [navigation cases](../../../tests/e2e-markets/navigation.spec.ts) and four existing mobile navigation cases covering the compact header/footer, plan menu and shared-plan link review.

The new suite checks 390, 768, 1024 and 1440-pixel layouts, visible destinations, minimum control height, horizontal fit and header/tab-bar accessibility. It also exercises desktop Markets → Pre-IPO → Planner navigation and tablet menu keyboard dismissal. Screenshots were visually inspected. Independent review additionally verified 320 and 801-pixel geometry without overflow or overlapping desktop links, plus keyboard menu behavior at 320 pixels.

Scoped ESLint and whitespace checks passed. Independent code review approved the navigation, execution-provider and demo changes. Local demo checks cover phone/desktop playback, chapter seeking, captions, text alternatives, keyboard tabs and archive pause behavior. An initial phone chapter timestamp contrast failure was corrected without weakening the accessibility assertion; both current-tour cases then passed. These checks do not establish real wallet sign-in or financial settlement.

The first full CI run passed lint, type checks, production build, **716 unit tests** (four credential-gated live cases skipped) and **131 PWA browser tests**. The feature-enabled suite passed 41 cases and failed two new navigation cases: the production Pre-IPO route captured operator flags at build time. This result is preserved in [CI run 36704964757](https://github.com/operatoruplift/lotline/actions/runs/36704964757); final passing evidence will be recorded after the fix.

## Purchase readiness

The accompanying provider-access change supports explicit server-side keyless Jupiter access. A configured API key takes precedence; without one, only `LOTLINE_EXECUTION_KEYLESS_JUPITER=true` opts in. The default remains closed. This setting does not enable purchases or bypass participant restrictions, semantic transaction validation, simulation, fees, freshness checks or receipt verification. See [execution requirements](../../execution.md).

Production configuration now includes `LOTLINE_EXECUTION_KEYLESS_JUPITER=true` for the next deployment (set September 30 via the authenticated Vercel CLI). No other execution or participant flags were changed. A reviewed participating wallet and issuer-access policy, enabled readiness gates, a funded supported route and fresh required references are still required. The user must approve the exact transaction in their wallet. No wallet was connected, transaction signed or mainnet settlement verified by this polish work.

## Demonstrations

Two new 1920×1080, 30fps tours were captured from the actual local app on September 30: a **52-second product tour** and a **48-second technical tour**. The technical explanation slides are labeled; Example calculations are synthetic. Both complete MP4s decoded successfully, representative frames were visually inspected, and both films have captions, chapters and complete text alternatives. No API writes were attempted. The [media manifest](../../../public/videos/release-20260930/manifest.json) records hashes, durations and scope.

The refreshed demo page leads with these current films and keeps all six historical films in a closed, dated archive. Switching current tabs or collapsing the archive pauses hidden playback. The archive explicitly identifies earlier product and authentication claims as historical.

Requested Ainsley narration through Higgsfield is blocked before generation because the connected workspace has zero credits. No narration job was created and no substitute system voice was used. The [narration record](../../video/app-tour-narration-20260930.json) preserves that status and the planned scripts. The new films are caption-led, contain no audio and are not proof of a settled purchase.
