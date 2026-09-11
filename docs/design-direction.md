# Lotline design direction

Research date: September 11, 2026. These are design recommendations based on the official public MotionSites catalog and designer-authored Dribbble pages. Template names and categories were verified; paid source code, licensing entitlements, implementation quality, and every responsive preview were not audited. No template purchase or third-party asset reuse was made.

## Best MotionSites starting point

**TrustFlow is the best overall MotionSites reference for Lotline.** It is listed under Finance, and its public detail view was verified in the official site. Use it as a starting point for financial-product communication, then keep Lotline's original paper-and-forest identity and real contribution preview. This is a design-fit recommendation, not a claim that its template already contains Lotline's integrations or app logic. [TrustFlow](https://motionsites.ai/?prompt=trustflow)

The current MotionSites offering is a prompt and design-reference library. A template selection does not establish a working Supabase application, secure authentication, exact allocation math, or mobile installation. Keep those in the tested Lotline codebase. [Official MotionSites catalog](https://motionsites.ai/templates)

## Component picks

| Surface | Reference to inspect | Lotline adaptation |
| --- | --- | --- |
| Landing page | [TrustFlow](https://motionsites.ai/?prompt=trustflow) | A concise headline, two actions, and the actual contribution layout. Primary: Make a plan. Secondary: Try the example. Start without an account. |
| Features | [NexaCore Control](https://motionsites.ai/sections?prompt=nexacore-control) | Three readable proof cards: exact allocation, read-only holdings, and a portable plan. Show small real UI fragments instead of abstract financial artwork. |
| Sign in / sign up | Solace sign-in in the [official sections catalog](https://motionsites.ai/sections?prompt=portfolio-about) | One compact form with clear labels, recovery and confirmation states. Explain optional cloud saving. Keep Continue as guest easy to find. Use one coherent form language for both flows. |
| Footer | Stark Minimal Footer in the [official sections catalog](https://motionsites.ai/sections?prompt=portfolio-about) | Logo and a brief product sentence; How it works, source, installation, and storage/privacy information. No filler social links or invented testimonials. |
| Loader | Loader Animation, listed in the [official catalog](https://motionsites.ai/?prompt=guardnet-landing) | Adapt the idea into Lotline's original three-bar mark. Animate only while a request is active; provide a text status. No artificial startup delay, looping marketing intro, or percentage that does not represent measured progress. |
| In-app layout | Price Calculator and Dashboard UI in the [official sections catalog](https://motionsites.ai/sections?prompt=portfolio-about) | Calculator-style inputs followed by current / contribution / resulting units. Preserve the single task. Avoid importing dashboard navigation that has no working destination. |

MotionSites' public listing labels Solace sign-in and Dashboard UI as premium in some indexed views. Verify current access terms on the official site before acquiring their prompts. The implementation here uses original components and does not depend on obtaining them.

## Dribbble references

[Personal Finance Investment Mobile App Design — Ronas IT](https://dribbble.com/shots/27200872-Personal-Finance-Investment-Mobile-App-Design) describes concise navigation, clear screen structure, and prominent balances. For Lotline, carry over the hierarchy principle: budget first, editable split second, results third. Keep all labels visible and use a single strong action in each stage.

[Fintech Budgeting Mobile App Dashboard Design — Ronas IT](https://dribbble.com/shots/27036028-Fintech-Budgeting-Mobile-App-Dashboard-Design) emphasizes quick-access actions and visual feedback. Apply that to real copy/download confirmation and a compact result detail area. Do not add its transfer, card, payment, or banking features to this calculator.

[Fintech Investment Portfolio Website Design — Ronas IT](https://dribbble.com/shots/26973751-Fintech-Investment-Portfolio-Website-Design) offers a reference for desktop information hierarchy. Lotline should use fewer panels: editable plan on the left and contribution results on the right. Its market charts, profit/loss colors, portfolio analytics, and transaction history are outside Lotline's purpose.

These are linked references, not source assets. No Dribbble screen, illustration, or proprietary component is copied into the application.

## Concrete screen decisions

- **Homepage:** Keep the existing headline and honest Example product preview. Add a concise capability section, an explanation of optional cloud saving, and an installation/help entry. Use real screenshots for launch materials.
- **Planner on desktop:** Compact header; plan editor beside the result workspace; mint and amount utilities in asset details. Account and install controls stay secondary to planning.
- **Planner on mobile:** Budget, assets, validation, estimate action, and result cards in that order. Keep full amounts visible at 375 px. Allow a keyboard user to reach every control without a pointer.
- **Account:** Present the reason to sign in before the form: keep a chosen plan across devices. Show explicit states for email confirmation, expired links, errors, and sign-out. Avoid implying that a cloud save happened until the server confirms it.
- **PWA:** Explain installation using the current browser's supported path. Offline status remains visible. Never display a cached market response as a fresh live quote.
- **Motion:** 120–200 ms for focus/hover/state transitions; a subtle one-time reveal in marketing sections; no motion required to understand data. Respect reduced motion. A result refresh should announce completion without moving keyboard focus unexpectedly.

## Original visual system

Use warm off-white `#F7F7F2`, white panels, forest `#174D3C`, charcoal `#18211D`, and soft gray-green borders. Amounts use tabular numerals. Keep body text legible, labels outside fields, control targets comfortable on touch screens, and statuses understandable without color. Retain the original three-bar SVG mark at 16, 24, and 32 pixels.

The best outcome is a consistent Lotline product across the public website, authentication, and installed app. Template references should support that consistency rather than introduce a different visual identity for every screen.
