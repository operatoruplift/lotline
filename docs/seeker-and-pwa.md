# Seeker and PWA readiness

This branch makes Lotline run as an installed app on Android, iOS and the Solana Seeker, and ships the Android shell the Solana Mobile hackathon and dApp Store need. Everything below was lint-, type- and build-checked; the on-device steps still need a phone.

## What changed

- `components/mobile-wallet.tsx` registers the Solana Mobile Wallet Adapter (`@solana-mobile/wallet-standard-mobile`) as a Wallet Standard wallet. The wallet picker in `components/execution-review.tsx` already lists every Wallet Standard wallet, so **Mobile Wallet Adapter** now appears on Android and Seeker next to injected wallets; choosing it hands the connect and the version-0 transaction signature to Seed Vault Wallet, Phantom or Solflare. The signing flow itself is unchanged.
- `next.config.ts` adds `ws://localhost:*` to `connect-src`. Local association is a WebSocket from the page to the wallet app on an ephemeral localhost port; without this the browser's CSP blocks the handoff silently.
- `android/` is a Solana Mobile Web Shell project (`dev.lotline.app`) that wraps `https://lotline.dev/app` in an Android WebView with native `solana-wallet://` intent handling, launcher icons and a splash screen generated from the brand mark.
- The PWA itself (manifest, service worker with the offline Example, install panel, safe-area viewport) was already complete and is untouched.

## Test on a phone (no APK needed)

1. Open https://lotline.dev in Chrome on Android or Seeker. Use the browser menu → **Install app**, or the in-page install control where one exists. On iPhone use Safari → Share → **Add to Home Screen**.
2. Launch from the home screen. The app should open full-screen with the status bar in the theme colour and content clear of the notch and gesture bar.
3. Wallet: On `/app` in Live mode, scroll to **Execution readiness**. The wallet list now includes **Mobile Wallet Adapter**; tapping it opens the phone's wallet chooser (Seed Vault Wallet on Seeker). Approve the connect, then **Review purchase** and **Sign this purchase** behave exactly as with a desktop wallet. Execution stays server-gated by `LOTLINE_EXECUTION_ENABLED`; on a deployment where it is off, the wallet still connects and the gate message explains why signing is unavailable.
4. Offline: turn on airplane mode and relaunch. Static assets and the shell load from cache; live data shows its normal unavailable state rather than a browser error.

Mobile Wallet Adapter registers itself only on Android in a secure context (or inside the Web Shell). Desktop, iOS and in-wallet browsers keep their injected wallets; nothing changes for them.

## Build the Android APK

The shell in `android/` was generated with `@solana-mobile/webshell-cli`, which the Solana Mobile docs now recommend over Bubblewrap. It wraps `https://lotline.dev/app` in a WebView with native wallet-intent handling, so the deployed site is the app: redeploying the web app updates the app without a new APK.

Prerequisites: Node 24+, `adb`, and about 2 GB of disk for the Android SDK. The CLI installs a managed JDK 17 and the SDK packages it needs on the first `build` (`doctor --fix` does the same without building).

```bash
npm install -g @solana-mobile/webshell-cli
cd android

# First build only: choose a release keystore. The CLI creates it if the file
# does not exist. Keep it and its passwords outside the repo; losing it means
# you can never update the app on the dApp Store.
export WEB_SHELL_KEYSTORE_PASSWORD='...'
export WEB_SHELL_KEY_PASSWORD='...'
webshell build . --keystore-path ~/keys/lotline-release.keystore --keystore-alias lotline

adb install -r app/build/outputs/apk/release/app-release.apk
```

Bump `--version-code` on every release (`webshell init . --force --version-code 2 --version-name 1.1.0` rewrites `gradle.properties`; the URL, id and icons are already recorded in `twa-manifest.json`).

## Publish on the Solana dApp Store

Winners must list on the dApp Store to claim CLOCK IN prizes, and the listing is the distribution channel for every Seeker owner.

- Register at the Publisher Portal (https://docs.solanamobile.com/dapp-publishing/intro): KYC/KYB, and a publisher wallet holding about 0.2 SOL. That wallet signs every future update, so treat it like the keystore.
- Signing key: a **new** key never used on Google Play. The keystore above qualifies.
- Assets: the 512×512 icon (`icons/icon-512.png` or equivalent here), a 1200×600 banner, and at least four phone screenshots.
- Submit the release APK; review currently takes 3–5 business days. Updates go through the `dapp-store` CLI with the same publisher wallet.

## Decisions to make before the first publish

- **Application ID is permanent.** This shell uses `dev.lotline.app`. Change it now (`webshell init . --force --application-id ...`) or never.
- **Host is pinned.** The shell keeps navigation on `lotline.dev` and opens other hosts in the system browser. Moving to a custom domain later needs a rebuild but keeps the application ID.
- **Deep links.** The shell opens the start URL; if you want `/rwa?mint=...`-style links to open the app, add an intent filter for the host in `android/app/src/main/AndroidManifest.xml`.

## CLOCK IN checklist (Solana Mobile × RadiantsDAO, closes 8 October 2026)

- [ ] Release APK built with the steps above and installed on a Seeker or Android device
- [ ] Public GitHub repo (this one), with this branch merged
- [ ] Demo video showing the install, the wallet handoff and the core flow on a phone
- [ ] Pitch deck: problem, product, why mobile-first, traction, team
- [ ] Optional SKR integration for the separate $10K SKR prize
