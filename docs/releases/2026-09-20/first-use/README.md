# First-use and contribution evidence — September 20, 2026

These are **local production-build checks with controlled catalog, quote, and wallet fixtures where noted**. They do not prove deployed behavior or a real purchase. No real wallet was connected and no funds moved during these recordings.

## First-use changes

- A fresh Live visit opens searchable asset selection and offers an explicitly applied illustrative 50/30/20 split from the loaded verified catalog. No holdings or prices are seeded.
- A stored empty draft remains empty across Live/Example switches and reloads. Returning custom drafts retain their budget and exact mints.
- An untouched Live default is not saved as deliberate empty intent. It shows “Draft ready” until an edit. Following the Example link or mode button from that untouched state opens the labeled illustrative plan; an edited or explicitly cleared empty draft stays empty.
- Loading, failed catalog, successful empty catalog, and selectable catalog are distinct. Refresh failure keeps existing names and allocations as temporarily unverified; current verification remains required for dependent actions.
- Purchase review sits immediately after contribution results. Catalog loss blocks new or resumed approvals and invalidates an outstanding wallet approval, including when catalog availability returns before the wallet resolves. Original receipts remain recoverable.
- Quote failure labels preserve server classifications alongside their detailed messages.

## Browser evidence

Command:

```sh
E2E_BASE_URL=http://127.0.0.1:3113 LOTLINE_CAPTURE_FIRST_USE=1 npx playwright test tests/e2e/first-use.spec.ts tests/e2e/expanded-planner.spec.ts tests/e2e/states.spec.ts tests/e2e/draft-persistence.spec.ts tests/e2e/execution-journey.spec.ts --reporter=list --output=/tmp/lotline-first-use-20260920
```

The first run passed 28 of 30 checks. Two test-harness assertions needed updating: the disconnect message now includes catalog changes, and the paused execution fixture needed the current public API's message field. No application change was required. Both corrected checks passed in the targeted rerun, including the no-submission assertion and receipt recovery during simultaneous catalog outage. All 30 tested behaviors are covered by the combined runs; the original failure log is retained.

- [Initial browser log](browser.log)
- [Two-case recheck](browser-recheck.log)

The wider release run then exposed a genuine first-use regression: merely opening Live had persisted an untouched empty draft, so a later linked Example visit stayed empty. The final source fix avoids that bootstrap write and tracks untouched state separately from actual edits. The rebuilt app passed **16 of 16** focused first-use, judge-readiness, and persistence checks in 41.7 seconds, including linked navigation, same-page toggles, deliberate remove-all, budget-only empty edits, reload, and blocked storage. These final checks also regenerated the four after screenshots.

```sh
E2E_BASE_URL=http://127.0.0.1:3113 LOTLINE_CAPTURE_FIRST_USE=1 npx playwright test tests/e2e/first-use.spec.ts tests/e2e/judge-readiness.spec.ts tests/e2e/draft-persistence.spec.ts --reporter=list --output=/tmp/lotline-first-use-final-20260920
```

- [Final rebuilt-app verification](browser-final.log)

The eight new first-use cases passed. The four width cases also passed WCAG A/AA automated checks and horizontal overflow checks. Before and after images use the same eight-asset catalog fixture, viewport heights of 1000px, and a fresh guest context:

| Width | Before | After |
| --- | --- | --- |
| 1440 | [Before](before-1440.png) | [After](after-1440.png) |
| 768 | [Before](before-768.png) | [After](after-768.png) |
| 390 | [Before](before-390.png) | [After](after-390.png) |
| 320 | [Before](before-320.png) | [After](after-320.png) |

Captures show the initial visit before scrolling. Decorative footer content below the initial viewport waits for its normal entrance; these screenshots assess the planner rather than footer animation playback. Before images precede the coordinated rebuild; after images show the changed working tree before publication.

## Deterministic semantic evidence

`npx vitest run tests/semantic-validation.test.ts --reporter=dot` passed **39 tests**. The encoded fixture uses deterministic synthetic wallet/pool/token keys and the supported Jupiter route_v2 instruction layout. It is not copied from a private provider order and is not a real transaction.

Coverage includes positive exact-in/minimum/default-fee decoding, actual instruction accounts resolved through an ALT, owner/program/authority controls, pool/vault/tick binding, additional or redirected transfers, lookup warmup/ownership/index failures, and same-bank simulation balances with and without destination creation. Negative tests assert rejection of altered raw spending, hidden fees, insufficient output, unexpected token accounts, incorrect SOL debits, and inconsistent account bytes.

The starter/storage/export targeted suite passed 24 tests. Targeted lint passed. Final whole-project lint, typecheck, build, and integration results are recorded by the parent release audit.

## Current silent recordings

[Initial recording log](recording.log) and [final recording log](recording-final.log). The source script is `scripts/record-contribution-release.mjs`.

The new clips render the current local UI with a persistent controlled-rehearsal label. Catalog and quotes are mocked, signing is disabled, and the script rejects any other non-GET API request. The first clip shows explicit starter selection, exact USDC allocation, source detail, and the honest purchase gate. The technical clip also demonstrates quote expiry and a fresh estimate request. Separate explanatory slides then show the sanitized recorded unsigned mainnet proof, original raw/scaled context, semantic validator call path, durable signature before submission, and unknown-state recovery. Those slides are labeled as explanations, not application screens or a live wallet recording. Neither clip claims real settlement happened.

- `public/videos/release-20260920/first-minute.mp4`: 25.96 seconds, 1440×1000, H.264, silent.
- `public/videos/release-20260920/technical-proof.mp4`: 57.04 seconds, 1440×1000, H.264, silent.
- Matching JPG posters, WebVTT captions, and text transcripts are present.
- Exact durations, sizes, and SHA-256 hashes: `public/videos/release-20260920/manifest.json`.
- Extracted technical explainer frames were visually inspected: [unsigned proof](technical-slide-1.jpg), [review path](technical-slide-2.jpg), and [durable recovery](technical-slide-3.jpg). Runtime assertions confirmed each slide fits without overflow or footer overlap.

The September 12 narrated films and September 19 controlled execution film are preserved unchanged.
