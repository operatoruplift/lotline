# September 30 regression release

This release builds on Claude's merged changes through `11b6acd`: Markets, Portfolio, community plans and following, wallet sign-in, crypto discovery, mainnet Pyth reads, batching and the mobile shell. The existing logo, videos, financial calculations and scroll-depth removal are preserved. The user's untracked `video/` workspace was not changed or included in the release.

## Fixes

- Reviewing a followed plan's new split preserves the previous accepted split. Cancel, Escape and leaving the review keep the change notice; Apply or the explicit Keep my split choice acknowledges it. Pending reviews are bound to the exact plan hash in tab storage, and applying cannot recreate a follow removed elsewhere.
- Cloud-plan sharing ignores responses from an old account or an unmounted component. Account generation is checked again after asynchronous schema imports. Sharing refreshes use their own ordered reads, so older snapshots cannot overwrite newer sharing changes or interrupt an unrelated save/delete. Failed refreshes preserve confirmed sharing state.
- The header retains its slide entrance with full text contrast throughout. Its former opacity/blur entrance could make the network label fail contrast checks. The regression samples the real animation halfway through.
- The demo's stray “Live The” typo and stale deployment/migration instructions are corrected.

## Verification

[PR #26](https://github.com/operatoruplift/lotline/pull/26) merged as `ee7bc5a416b2db101648ffc4d9820f6246e96c7e`. The tested revision `dce521a20ae1af6627c7eecc1feaf47eb305819c` and the merge have the identical tree `b4c294daa4dba064911ce783a96ff34e7b427dde`.

[CI 36699148815](https://github.com/operatoruplift/lotline/actions/runs/36699148815) passed lint, typechecking, the production build, **706 unit tests**, **129 PWA browser tests** and **37 feature-enabled browser tests**, without retries. Four opt-in live tests were skipped. Independent final code review approved the tested revision without remaining findings.

Local checks included 34 focused unit cases, four portfolio browser cases, scoped lint and the canonical typecheck. Two delayed-request concurrency cases were inconclusive on the development server because they crossed the application's 15-second request timeout before the fixture released the request. Both passed against the final production build in CI; no timeout or accessibility threshold was weakened.

Fixture-based account, wallet and execution tests establish application behavior, not delivery of a real email, a real wallet sign-in or a financial settlement.

## Current configuration and design reference

A read-only Supabase migration listing on September 30 confirmed the execution-batch, initial gallery, gallery-update and crypto-plan-mint migrations are applied to project `uemunksopacicpbjubtg`. No database or environment changes were made in this release.

The live Portfolio, Markets, Community and wallet sign-in entry screens were observed before release. Crypto was not present in the live Portfolio type list. These are deployment observations, distinct from the feature-enabled CI suite; feature flags remain separately managed.

The [OhMyFund portfolio](https://www.ohmyfund.com/) and [screener](https://www.ohmyfund.com/screener) were reviewed as interaction references: category browsing, dated snapshot labels, asset detail panels, token-version selection and a direct add-to-plan action. Those patterns align with Claude's existing Lotline additions. This release corrects their behavior without replacing Lotline's visual identity or importing another product's assets or market data.

## Production results and remaining limits

The application merge is live at [lotline.dev](https://lotline.dev). Vercel reported deployment `dpl_7EKRUvwP2wkL7qNxDrAFdN2kUrCy` ready with source `ee7bc5a416b2db101648ffc4d9820f6246e96c7e`. [Deployment evidence](deployment.json) records its aliases and the distinction between this application release and later documentation-only commits.

Read-only checks between 10:07 and 10:09 UTC passed for all nine sampled pages and all 22 discovered demo-media references. PreStocks returned eight verified assets with none unavailable. At a 390 × 844 phone viewport, Portfolio and the example planner fit the screen. The landing page scrolled natively with no depth layers; the hero retained the same document position before and after scrolling.

Pyth availability varied across two reads. The first response was partial: three stale equity observations from the Solana receiver fallback, no token observations and fresh USDC. One bounded follow-up returned three fresh equity observations, three fresh token observations and fresh USDC through Lazer, with all feed identities matching the pinned registry. [Hosted evidence](hosted.json) preserves both responses. This demonstrates working references and freshness reporting at those times, not continuously fresh upstream availability. No Pyth code was changed in this release.

Production execution still reports `configuration-required`, with purchases disabled and reconciliation available. Real email delivery, wallet sign-in and financial settlement were not performed in these checks. These remain separate from the passing fixture-based tests; no wallet was connected, transaction signed or funds moved.
