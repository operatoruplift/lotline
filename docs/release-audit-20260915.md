# Lotline release audit — 15 September 2026

This audit covers the selected L1 Kova, L4 Veloce, L5 Heritage Grove and L6 Liquid Glass release, the expanded contribution planner, the gated execution journal, repeat-contribution reminders, PWA behavior and preserved product films. It records observed behavior separately for the production alias and the current local checkout. No wallet was connected, no signature was requested and no funds moved.

## Identity and evidence boundary

| Item | Observed value |
| --- | --- |
| Repository | `/Users/rvaclassic/Documents/Codex/2026-09-11/files-pasted-by-the-user-you/outputs/lotline` |
| Branch / HEAD at audit start | `main` / `a4010117ff94e1076f1424fa993b8c8ce4c9214b` (`a401011 Record applied execution migration`) |
| Remote | `https://github.com/operatoruplift/lotline.git` |
| Local state at audit start | clean; audit fixes now leave only the paths listed below dirty |
| Current dirty paths | Includes the prior audit paths plus execution owner/recovery changes in `app/api/execution/*`, `components/execution-review.tsx`, `components/contribution-schedule.tsx`, `lib/server/execution/*`, `tests/execution.test.ts`, `supabase/migrations/20260915090000_guest_execution_owner_index.sql`, and updated execution/deployment docs. |
| Production alias | [lotlineonsolana.vercel.app](https://lotlineonsolana.vercel.app) |
| Current production revision | `dpl_9FSoQKHERwL3qzL8BADFgZfiTK1P`, Ready, deployed September 16, 2026 from the reviewed checkout; aliased to [lotlineonsolana.vercel.app](https://lotlineonsolana.vercel.app) |
| Supabase | project `uemunksopacicpbjubtg`; the first four migrations are aligned and applied, including `20260914090000_execution_journal.sql`; the guest-owner index/quota migration is local and pending. |
| Runtime | Next.js 16.3.4, React 19.3.0, TypeScript 5.9.3, Node 22+ |

The `production-*` screenshots in `docs/screenshots/audit-20260915/` are read-only observations from the prior hosted revision. The current production release now includes the reviewed L1 and PWA fixes; the `local-*` captures remain supporting evidence from the same source checkout.

## Requirements and control matrix

| Requirement | Source / surface | Actual behavior and evidence | Status | Defect / resolution |
| --- | --- | --- | --- | --- |
| L1 left-aligned hero with truthful previews | `app/page.tsx`, `app/home.module.css` | Desktop and mobile production checks show the left-aligned heading, copy and actions with three illustrative contribution/split/detail previews. | verified-working in production | None. |
| L4 stagger-height feature cards | `app/page.tsx` | Three cards render at 450/350/450px with 40px desktop corners, bottom alignment and mobile stacking. `landing-layout.spec.ts` passes. | verified-working locally and in previous hosted build | None. |
| L5 Heritage Grove footer | `components/site-shell.tsx`, footer media | Landscape remains readable, footer copy stays above media at tablet widths, and the actual scenic derivative decodes and advances. | verified-working | None. |
| L6 Liquid Glass account entry | `components/liquid-glass.tsx`, `/sign-in` | Same-origin video is sampled by the canvas renderer; native inputs remain crisp; production state was `data-refraction-state="video"` with advancing frame count. | verified-working | None. |
| Example planning | `/app?mode=example`, `components/planner.tsx` | Synthetic 832-asset catalog, exact split math, no wallet or signature; local and production HTTP/browser checks passed. | verified-working | None. |
| Larger plans | `lib/domain/limits.ts`, planner picker | Maximum 10 selected assets; catalog contains 832 issuer identities and all 832 are available to Example. | verified-working | Catalog presence is not a liquidity promise. |
| Exact allocation arithmetic | `lib/domain/math.ts`, `tests/execution.test.ts` | USDC micro-units and basis points use bigint/largest remainder; execution intent validates leg sums and deterministic allocation. Unit suite passes. | verified-working | None. |
| Live read plane | `/api/assets`, `/api/holdings`, `/api/units`, `/api/quotes` | Issuer/mint identity, public-address holdings, scaled units and quote-only estimates remain separate; optional failures are explicit. | implemented; hosted read evidence is historical | Current audit intentionally did not request live wallet data. |
| Quote freshness and no-route handling | `lib/server/quotes.ts`, planner states | Bounded requests, freshness/expiry checks, input invalidation and explicit unavailable states are covered by unit/browser suites. | verified-working locally | None. |
| Durable execution journal | `app/api/execution/*`, Supabase migrations | Runs, legs, attempts, events, schedules and occurrences persist server-side with RLS/service-role boundaries and CAS state transitions. The base journal migration is applied; the guest-owner index/quota/rate-limit migration is local and pending. It adds per-capability, per-user daily and global daily run limits, stale non-broadcast cleanup, a 50,000-row unresolved guest ceiling and bounded terminal guest retention. | implemented-unverified | Execution remains disabled until the additive guest migration, its explicit readiness flag, Jupiter key and validator review are supplied. |
| Safe execution boundary | `/api/execution/config` | Production returns HTTP 503 with explicit reasons for paused flag, missing server Jupiter key and validator review. No wallet prompt is reachable. | verified-working safety gate | Keep `LOTLINE_EXECUTION_ENABLED=false` and `LOTLINE_EXECUTION_VALIDATOR_READY=false`. |
| Sequential recovery | `execution-review.tsx`, execution domain | One leg is reviewed/signed at a time; duplicate active attempts are blocked and unknown attempts reconcile the original attempt. Fixture/unit coverage passes. | implemented; settlement-unverified | A funded controlled wallet smoke is intentionally absent. |
| Repeat contributions | `contribution-schedule.tsx`, `/api/contribution-schedules` | Local weekly/monthly reminders, pause/resume and ICS export work; authenticated cloud route is owner-scoped. Production unauthenticated POST/GET returns HTTP 401. | verified-working locally; cloud owner journey historical | No automatic catch-up or unattended purchase is implied. |
| Authentication | `/sign-in`, `/sign-up`, recovery/update routes | Sign-in page and guest continuation render. Public email signup/recovery remain gated by `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false`. | partial / externally-blocked | Configure and verify custom SMTP before enabling public email flows. |
| PWA install/offline | `components/pwa.tsx`, `public/sw.js` | Public-only cache, offline Example and install guidance work. Synthetic `beforeinstallprompt` passes twice after the panel listener race fix. | verified-working in production | None. |
| Brand/favicon/kit | `lib/brand/*`, `/brand-kit`, file-based icons | Concept 02 three-branch mark, favicon, app icons and 19 downloadable brand-kit assets are present. Production route, ZIP and guide returned HTTP 200. | verified-working | None. |
| Product and technical films | `/demo`, `public/videos/release-20260912/*` | Narrated Ainsley product/technical films retain native controls, captions, transcripts, seeking and dated scope in the current production release. | verified-working in production | Films describe planner capabilities; they do not claim settlement. |

## Route and control inventory

| Route / control | Handler and outcome | Observed result |
| --- | --- | --- |
| `/` Make a plan | Next link to `/app` | Opens planner. |
| `/` Try the example | Next link to `/app?mode=example` | Opens synthetic planner with labeled Example mode. |
| `/` Watch demo | Next link to `/demo` | Opens spoken product/technical films. |
| Header How it works / Sign in / Make a plan | Next links | All resolve to real routes. |
| Decorative motion | `MotionProvider`, `DecorativeVideo` | Visible scenes play continuously; offscreen/hidden scenes pause for resource safety, reduced-motion settings use stills, and autoplay rejection exposes a retry action. There is no manual pause control. |
| Footer links, GitHub, Install app | `SiteFooter`, PWA anchor | Real pages/open-source link/install panel; no fictional contact or social links. |
| Planner Live / Example tabs | `Planner.switchMode` | Explicit mode switch; Example is synthetic, Live remains provider-backed and unavailable offline. |
| Asset search/picker and remove | Planner handlers | Search over the expanded catalog, add up to ten, remove without silently rewriting other weights. |
| Budget and percentage fields | Planner validation | Invalid/partial allocations stay visibly incomplete; exact totals are shown. |
| Split evenly / Reset example | Planner handlers | Deterministic split or explicit Example reset with notice. |
| Get estimates / Refresh estimates | Quote handlers | Quote-only requests; stale, unavailable and offline states are labeled. |
| Load/reload balances | Holdings handler | Public-address read only; wallet address is not saved. |
| Copy plan / Download CSV / Copy mint and amount | `lib/domain/share.ts`, `export.ts` | Explicit share review and exact permitted fields; no wallet/session/quote payload. |
| Verify this plan / asset context | Planner disclosure panels | Exposes issuer/mint and optional context without promising tradability. |
| Execution review | `components/execution-review.tsx` | Example shows read-only boundary; Live is disabled by production readiness response. |
| Reminder cadence, pause/resume, Add to calendar | `ContributionSchedule` | Local manual reminder and ICS export; no auto-signing or auto-trading. |
| Save/load/delete named plan | `CloudPlans`, `/api/plans` | Authenticated owner-scoped CRUD; account gate remains visible when email is disabled. |
| Auth forms and guest continuation | `AuthForm`, Supabase callback routes | Native form handlers, safe callback allowlist and guest link; public email actions remain gated. |
| Install Lotline | `PwaSupport` | Browser prompt or platform-specific instructions; offline readiness message reflects service-worker response. |

## Selected visual and media map

| Selection | Component / media | Current evidence |
| --- | --- | --- |
| L1 Kova | `app/page.tsx`, `hero-boomerang(.mp4)`, three product previews | Local repaired composition at 1440/390; production prior composition captured for comparison. Hero motion advanced from 0.727781s to 1.356394s in a fresh production context. |
| L4 Veloce | Feature cards 01/02/03 and `feature-*.mp4` | All three cards are visible after scroll; feature video advanced from 0.992770s to 1.558383s. |
| L5 Heritage Grove | `SiteFooter`, `footer-landscape.mp4` and poster | Footer video decoded at 1.175162s in production; tablet layout places 16:9 media below copy. |
| L6 Liquid Glass | `LiquidGlass`, `auth-glass(.mp4)` and canvas renderer | Production card state `video`, 11 sampled frames in the evidence run; video advanced from 0.293239s to 0.763325s. Navigation cleanup separately confirmed `paused=true`, `src=null`, `connected=false`. |
| Spoken release films | `/demo`, `public/videos/release-20260912` | Preserved product/technical MP4s, captions, transcripts, posters and editables; decorative pipeline does not replace them. |
| Brand | `lib/brand/mark.json`, `public/brand/*`, `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png` | Concept 02 three-branch mark is shared across header, footer, loader, favicon and kit. |

The fresh motion measurements are stored in [`audit-motion-evidence-20260915.json`](audit-motion-evidence-20260915.json). Matched screenshots are in [`screenshots/audit-20260915/`](screenshots/audit-20260915/), including production and local hero, feature, footer, planner and sign-in views at desktop/mobile sizes. The concept boards remain illustrative references; the actual site uses the supplied source-derived videos and truthful product data.

The staged purchase/recovery/reminder walkthrough is documented in [`execution-demo-script.md`](execution-demo-script.md). It distinguishes the current production safety gate from a separately authorized funded test-wallet smoke.

## API capability matrix and external gates

| Boundary | Authority / contract | Readiness and observed behavior |
| --- | --- | --- |
| xStocks catalog | Issuer identity + exact Solana mint | 832 snapshot identities; Example is synthetic and does not establish current liquidity or legal eligibility. |
| Solana RPC | Mint owner/extensions, public holdings, chain metadata | Configured server-side; no wallet was supplied in this audit. |
| Jupiter Swap v2 | Amount-specific `/order` and `/execute` adapters | Quote-only read plane is retained. Execution adapter is bounded to validated v0 `iris`/`metis` routes but disabled without `JUPITER_API_KEY` and validator approval. |
| Supabase | Auth/session, owner-scoped plans/schedules, privileged execution journal | Project linked; base journal migration applied; additive guest-owner index/quota/rate-limit migration is local and pending; browser never receives the secret key. |
| Tokens.xyz | Optional supplementary asset context | Adapter remains off pending verified API access, server key, terms and quota review. It cannot replace issuer or Solana identity. |
| PWA service worker | Public assets and `/offline` only | Live APIs, auth pages, sessions, private plans and execution records are excluded from caches. |

Production capability check after the September 16 release returned:

```text
deployment: dpl_9FSoQKHERwL3qzL8BADFgZfiTK1P (READY)
GET /api/execution/config -> 503 configuration-required
reasons: execution paused; server-side Jupiter API key required; guest execution journal migration not confirmed; supported-instruction validator review required
GET /api/contribution-schedules -> 401 for an anonymous request
GET /api/assets -> 200, 832 assets (AAPLx first, ZTSx last)
GET /demo media and captions -> 200; hosted product and technical browser journeys passed
```

`npx supabase@2.117.0 migration list --linked` reported matching local/remote versions `20260911170809`, `20260911170815`, `20260912094113` and `20260914090000`; the current local `20260915090000_guest_execution_owner_index.sql` is intentionally not applied remotely.

The smallest external actions for the blocked gates are: apply the pending guest-owner/index/quota/rate-limit migration if guest execution is desired and then set `LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY=true`, add a server-only `JUPITER_API_KEY`, complete explicit review of the supported instruction validator and representative v0 transactions, then perform a separately authorized funded test-wallet settlement smoke; configure and verify custom SMTP before enabling public signup/recovery; obtain approved Tokens.xyz API access before enabling enrichment.

## Verification results

Local checks on the current source:

```text
npm run lint       passed
npm run typecheck  passed
npm test           21 files passed, 1 skipped; 248 passed, 1 skipped
npm run build      passed; execution and schedule routes generated
node scripts/prepare-design-media.mjs --verify-only
                    passed; all nine derivatives fully decoded and matched the media manifest
```

Browser checks against the rebuilt local production server (`E2E_BASE_URL=http://127.0.0.1:3112`) completed as:

```text
69 passed (all browser journeys, including the production service-worker
offline reload, media playback/captions, responsive planner and execution
readiness boundary).
```

The same suite remains runnable against a hosted alias by setting `E2E_BASE_URL`; the September 16 production deployment includes the motion-control removal. A fresh production browser context had no page errors, zero horizontal overflow at 390px, advancing hero/feature/glass media, offscreen resource pausing, reduced-motion poster fallback and working native account controls. No transaction or email delivery was attempted.

The follow-up code-review pass covered guest recovery, rate budgets, stale-review invalidation, signed-attempt restoration, quota locking, retention and bounded RPC calls. The security review remains clean for the current gated release: no tracked secrets, no high-severity npm audit findings, and no execution capability exposed while the server readiness boundary is closed. The fifth migration still requires an external apply before guest execution can be enabled.
