# September 30 app polish

Status: local implementation and focused navigation verification complete. Final CI, deployment and hosted playback results are pending and will be recorded separately. This follows the [earlier September 30 regression release](release.md).

## Product changes

- Desktop app navigation adds a direct Planner destination, groups the main sections together and clearly marks the current page with a sage pill. Compact spacing keeps the header usable between phone and wide desktop layouts.
- The phone and tablet tab bar becomes a bounded cream-and-sage dock with a visible Plan label. Its menu retains planner, market, community, PreStocks, shared-link and Example entry points. Keyboard opening, Escape dismissal and focus restoration remain supported.
- Community stays available when moving into Markets or the PreStocks planner. Both planners belong to Portfolio in the mobile navigation when Community occupies the fourth tab. Account screens identify their active destination.
- The existing brand, public landing header, financial calculations, account behavior and historical media are preserved. The user-owned `video/` workspace is untouched.

## Verified locally

All **10 focused browser tests passed**: six new [navigation cases](../../../tests/e2e-markets/navigation.spec.ts) and four existing mobile navigation cases covering the compact header/footer, plan menu and shared-plan link review.

The new suite checks 390, 768, 1024 and 1440-pixel layouts, visible destinations, minimum control height, horizontal fit and header/tab-bar accessibility. It also exercises desktop Markets → Pre-IPO → Planner navigation and tablet menu keyboard dismissal. Screenshots were visually inspected. Independent review additionally verified 320 and 801-pixel geometry without overflow or overlapping desktop links, plus keyboard menu behavior at 320 pixels.

Scoped ESLint and whitespace checks passed. Independent code review approved the navigation changes with no remaining findings. These checks cover the app shell; they do not establish real wallet sign-in or financial settlement.

## Purchase readiness

The accompanying provider-access change supports explicit server-side keyless Jupiter access. A configured API key takes precedence; without one, only `LOTLINE_EXECUTION_KEYLESS_JUPITER=true` opts in. The default remains closed. This setting does not enable purchases or bypass participant restrictions, semantic transaction validation, simulation, fees, freshness checks or receipt verification. See [execution requirements](../../execution.md).

Production configuration now includes `LOTLINE_EXECUTION_KEYLESS_JUPITER=true` for the next deployment (set September 30 via the authenticated Vercel CLI). No other execution or participant flags were changed. A reviewed participating wallet and issuer-access policy, enabled readiness gates, a funded supported route and fresh required references are still required. The user must approve the exact transaction in their wallet. No wallet was connected, transaction signed or mainnet settlement verified by this polish work.

## Demonstrations

New current-app demonstrations are being captured and assembled; final media, playback and deployment verification remain pending. Requested Ainsley narration through Higgsfield is blocked before generation because the connected workspace has zero credits. No narration job was created and no substitute system voice was used. The [narration record](../../video/app-tour-narration-20260930.json) preserves that status and the planned scripts. Historical films remain preserved; a caption-led capture must not be labeled as narrated or as proof of a settled purchase.
