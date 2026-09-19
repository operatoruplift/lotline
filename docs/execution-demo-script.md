# Lotline execution demo script

**Purpose:** a reviewable 3–4 minute presentation outline for the staged contribution path. The current public deployment keeps execution paused. A real purchase demonstration requires separately authorized funds and completed implementation/configuration gates; the current local demonstration uses controlled fixtures only.

## Delivered local browser evidence — September 19

The [recorded four-leg walkthrough](releases/2026-09-19/fixture-walkthrough/execution-fixture-walkthrough.mp4) uses a fake Wallet Standard signer and mocked Jupiter/RPC responses. It shows two confirmations, an unknown third result, a reload, reconciliation of that original attempt, the fourth leg, receipt preservation and saved reminders. The persistent banner labels those boundaries. No actual transaction was sent. The outline below is a longer presentation script, not the transcript or measured timing of this silent recording.

## Before recording

- Use a disposable browser profile and a clearly labeled test wallet. Never use a personal key or real funds for a recording.
- Confirm the exact deployment URL, commit, catalog snapshot, Jupiter key, Solana RPC history, applied journal migrations, guest limits and supported-router validator.
- Keep `/api/execution/config` visible in the operator notes. An HTTP 200 result with `state: configuration-required` and `enabled: false` is the truthful current public behavior and is itself a valid safety-boundary scene.

## Walkthrough

1. **Build the split (0:00–0:45).** Open `/app?mode=example`, choose AAPLx, MSFTx, NVDAx, TSLAx, SPYx and QQQx, enter `10.000001` USDC and set `30 / 20 / 20 / 10 / 10 / 10`. Point to `3.000001 / 2.000000 / 2.000000 / 1.000000 / 1.000000 / 1.000000`; explain that zero-micro-USDC legs remain in the immutable intent even though they are skipped for execution.
2. **Inspect the inputs (0:45–1:15).** Open the issuer and mint details, show the synthetic Example label, then switch to Live only when network access is available. Request fresh estimates and call out gross USDC input, minimum output, route, fee policy, wallet and expiry. Editing the basket clears the old estimates.
3. **Review one order (1:15–1:45).** Connect a Wallet Standard test wallet. Select **Review purchase**. Lotline creates one durable run and one just-in-time Jupiter order. Show the exact leg amount, minimum output, router, message hash and expiration. The **Sign this purchase** action is separate.
4. **Sign and verify (1:45–2:30).** Approve only the displayed bytes. The server verifies the message hash, payer, required signer and signature before calling Jupiter `/execute`. Show `submitted → confirming → confirmed`, the chain signature, confirmation level and slot. Never call a basket atomic: each asset is a separate Solana transaction.
5. **Recover a partial run (2:30–3:15).** In a fixture or controlled smoke, confirm legs one and two, leave leg three `unknown`, and reload. Show the two preserved receipts, the paused progression and the reconciliation of the original signature. Click **Resume remaining**. Once chain evidence resolves the unknown attempt, Lotline requests a fresh order only for an eligible remaining leg; it never repurchases the confirmed legs or silently redistributes their USDC.
6. **Save the next review (3:15–3:45).** Choose weekly or monthly, set a timezone-aware due date, pause/resume the reminder and export the calendar event. Explain that a due reminder creates a new review opportunity and fresh quote, never an automatic signature or purchase. **Sync account** is opt-in and owner-scoped.

## Closing narration

“Lotline makes the next contribution exact and inspectable. Every leg has its own reviewed amount, signature and receipt. A timeout stays unresolved until the original transaction is reconciled, and a reminder always returns to a human review step.”

## Evidence labels

Label every capture as **Example synthetic**, **read-only Live**, **controlled test-wallet**, or **production safety gate**. Do not describe a local fixture as a mainnet purchase, and do not enable execution from a demo browser. Record the commit, route, UTC time, wallet fixture and readiness response alongside the video.
