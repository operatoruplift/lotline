# Dependency verification

Verified September 11–12, 2026 using official npm registry metadata and installed package exports. The application requires Node.js 22 or newer because the installed Supabase client requires it. Builds have been exercised with Node 22.19 and Node 24.

| Dependency | Pinned version | Compatibility evidence |
| --- | --- | --- |
| Next.js | 16.3.4 | Official App Router installation documentation and npm metadata; requires Node >=20.9 |
| React / React DOM | 19.3.0 | Within Next.js 16.3.4 peer range |
| Tailwind / PostCSS plugin | 4.3.3 | Matching current packages; CSS import and PostCSS plugin configured |
| Solana Kit | 8.3.0 | Token-2022 peer requires Kit ^8.0.0 |
| Token-2022 | 0.17.0 | Installed package exports `amountToUiAmountForMintWithoutSimulation`; helper reads mint extensions and chain clock |
| Supabase JS | 2.116.0 | Installed package requires Node >=22.0.0; used for Auth, owner-scoped plan access, and server-only provider coordination |
| Supabase SSR | 0.12.7 | Installed peer range is Supabase JS ^2.114.0, satisfied by 2.116.0; supplies official browser/server cookie clients |
| TypeScript | 5.9.3 | Meets Next.js minimum 5.1 and installed lint parser compatibility |
| ESLint / Next config | 9.39.5 / 16.3.4 | Next's bundled React, import, and accessibility plugin peer ranges currently support ESLint 9, not 10 |
| Vitest | 5.0.0 | Node test runner; server-only modules aliased only for Node tests |
| Playwright | 1.63.0 | Current package with matching installed Chromium revision |
| axe-core / Playwright integration | 4.13.0 | Automated browser accessibility checks alongside keyboard and responsive journeys |

PWA installation uses a Web App Manifest, original PNG/SVG icons, and a scoped service worker. No separate native framework or application-store wrapper is included. Cache rules are tested directly and through disconnected production-browser journeys.

ESLint 9 is deprecated upstream, but is deliberately pinned because the installed Next.js lint plugin peers reject ESLint 10. No peer override or legacy-peer-deps install is required by the final lockfile. Reassess when those official plugins add compatible support.

Sources: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Solana Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount), [Token-2022 package](https://www.npmjs.com/package/@solana-program/token-2022), and each package's installed `package.json`. The lockfile records exact resolved versions and integrity hashes.
