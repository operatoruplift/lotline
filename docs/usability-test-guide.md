# Lotline — short human usability test

**Status:** a guide for obtaining feedback, not a report of feedback already obtained. No participant findings or traction are claimed.

## Setup

Invite someone who already understands their preferred assets and contribution split. Use a separate browser profile with no private wallet or account information. Test the reviewed local build on desktop and approximately 390px mobile; record the build, viewport, date and whether the test is Example or Live. Ask permission before recording their screen or quoting them. Ten to fifteen minutes is enough for one session.

Give this scenario without explaining the controls: “You want to contribute 10.000001 USDC using Apple, Microsoft and NVIDIA at 50%, 30% and 20%. Prepare the plan, keep it for next time, and work out what you would do to review a trade.” Clarify that this is a usability exercise, not an allocation recommendation. Use Example unless a read-only Live check is appropriate and available.

For catalog-search checks, use the current local build: it includes all 832 snapshot assets in Example, while the public site still had six at the September 12, 12:51 UTC observation. The extra 826 use generic synthetic one-unit-per-100-USDC rates and zero illustrative holdings. Do not ask participants to assess these as real prices or personal balances; record which version they actually used.

## Tasks to observe

1. From the homepage, explain what Lotline does and begin without registering. Note whether the participant understands Example is synthetic.
2. Find the three assets, enter the amount and chosen percentages, and explain what the resulting USDC amounts mean. Ask whether the percentages apply to the contribution or the entire portfolio.
3. Request estimates and inspect **Verify this plan**. Ask which fields are exact, which are estimates, what is synthetic/live, and when they stop being fresh. If a provider fails, observe whether the participant understands the unavailable state.
4. Copy or export a useful plan. Change the budget to **25.000001**, reload, and find the retained split. Ask what was saved and whether a quote was also saved.
5. Open a provided share-review link and cancel it. Confirm they can return to their original draft; do not instruct them to overwrite it accidentally.
6. Find the independent Jupiter handoff and describe the next steps. Stop before trading. Ask whether opening the link means a purchase has happened.

Use keyboard-only navigation for at least the amount, percentage and primary action, then repeat the central flow at mobile width. Ask whether the continuously playing motion is distracting and whether the reduced-motion preference is respected. Observe rather than coaching; record assistance separately from unassisted success.

## Recording sheet

| Field | Record only what happened |
| --- | --- |
| Participant | Anonymous ID; relevant experience, volunteered by the participant |
| Build/context | Commit or local working-tree identifier, date, browser, viewport, mode |
| Each task | Unassisted / assisted / not completed; elapsed time; exact stopping point |
| Understanding | Their own explanation of contribution weights, saved draft, estimates and handoff |
| Friction | Control or wording that caused hesitation, mistaken action or abandonment |
| Quote | Exact words, with permission; otherwise paraphrase and label it |
| Follow-up | Observed issue, proposed small fix, and retest outcome when actually performed |

For the facilitator, the exact expected allocations are **5.000001 / 3.000000 / 2.000000**, then **12.500001 / 7.500000 / 5.000000** after the budget change. Check these after the task rather than giving the answer in advance.

Finish with: “When would you use this again?”, “What would you use instead?” and “What would stop you trusting or returning to it?” Treat answers as exploratory feedback. A small usability session can reveal friction; it does not establish product demand or justify invented adoption statistics.
