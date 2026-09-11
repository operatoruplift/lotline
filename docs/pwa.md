# Install Lotline

Lotline is an installable PWA with one responsive codebase for phone, tablet, and desktop. It is a browser application; no native app-store binaries are required or claimed.

- **Chrome or Edge:** open the deployed HTTPS site and choose **Install Lotline**, the address-bar install icon, or the browser’s install menu item.
- **iPhone or iPad:** open the site in Safari, choose **Share → Add to Home Screen → Add**. Turn on **Open as Web App** if offered.
- **Safari on Mac:** choose **File → Add to Dock**.
- Browsers that do not support installation can use the website normally or bookmark it. Browser versions and managed-device policies affect installation availability.

The original Lotline three-bar mark is included as 192 px and 512 px PNG icons, a separately padded maskable icon, a 180 px Apple touch icon, and editable SVG sources. Standalone display supports safe-area insets and unrestricted page zoom.

## Offline behavior

Visit Lotline online once and let the **Example is ready to use offline** status appear in the installation instructions. Reloading a public Lotline page without connectivity opens the clearly labeled synthetic Example planner. Its exact allocation math, local draft, fixture estimates, and CSV export continue to work. Live prices, wallet balances, sign-in, and account sync require connectivity.

Only `/offline` and the same-origin static assets required to render it enter the service-worker cache. `/offline` is forced static and does not include personalized server output. The worker never caches API responses, authentication flows, private account pages, third-party requests, or Next server-component responses. Switching to Live while offline clears Example estimates and disables live estimation.

The public Example document is refreshed online only after every required asset has loaded. A failed refresh preserves the previously working document. Cache names are scoped to Lotline, and activation removes only older Lotline offline caches. Browser storage can be evicted; an offline cache is a convenience, not a backup. Sign-in never enables private offline storage.

## Production verification

Service workers are intentionally disabled under `next dev`, where changing development chunks are unsuitable for offline caching. Test with a production build on HTTPS or loopback:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3101
E2E_BASE_URL=http://127.0.0.1:3101 npx playwright test tests/e2e/pwa.spec.ts
```

The PWA tests verify manifest icon dimensions, credential-free public precaching, cache exclusions, failed-refresh preservation, install instructions, install-prompt handling, and a disconnected reload that calculates and exports the real Example plan. Actual OS installation is performed by the user’s browser; browser automation verifies the browser integration and standalone metadata rather than claiming a physical iPhone install.
