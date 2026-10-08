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

Build it with Gradle directly. You need JDK 21 and the Android SDK (`build-tools` 36.1).

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk
cd android

# A debug build, for a phone you control.
./gradlew --no-daemon assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Sign a release

The dApp Store needs a release APK signed with a key that has never been used on Google Play. Create the keystore once and keep it, and its passwords, outside the repository. Losing it means you can never update the app on the dApp Store.

```bash
keytool -genkeypair -v -keystore ~/keys/lotline-release.keystore -alias lotline -keyalg RSA -keysize 4096 -validity 10000
```

`android/app/build.gradle.kts` reads the keystore file and alias as Gradle properties and the two passwords from the environment:

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk
cd android
WEB_SHELL_SIGNING_STORE_PASSWORD=… WEB_SHELL_SIGNING_KEY_PASSWORD=… ./gradlew --no-daemon assembleRelease -PWEB_SHELL_SIGNING_STORE_FILE=$HOME/keys/lotline-release.keystore -PWEB_SHELL_SIGNING_KEY_ALIAS=lotline
```

**A missing property silently produces an unsigned APK.** If the store file, alias or store password is absent, Gradle skips signing and writes `app/build/outputs/apk/release/app-release-unsigned.apk` without an error. Only `app-release.apk` is signed. Check it before you upload:

```bash
~/Library/Android/sdk/build-tools/36.1.0/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

Raise the version for every release: set `WEB_SHELL_VERSION_CODE` (a whole number, one higher each time) and `WEB_SHELL_VERSION_NAME` in `android/gradle.properties`, or pass them with `-P`.

### English only

The app is in English. The AndroidX libraries carry translations for about 85 locales, and an APK declares every locale it contains, so the store would list them all. `androidResources { localeFilters += listOf("en") }` keeps English only. Check a build with:

```bash
~/Library/Android/sdk/build-tools/36.1.0/aapt2 dump badging app/build/outputs/apk/debug/app-debug.apk | grep -E '^locales'
```

It prints `locales: '--_--' 'en'`. Before the filter it listed 86 entries.

## Publish on the Solana dApp Store

Winners must list on the dApp Store to claim CLOCK IN prizes, and the listing is the distribution channel for every Seeker owner. The listing text, banner and screenshots are in [`docs/dapp-store/`](dapp-store/listing.md).

- **Publisher Portal:** https://publish.solanamobile.com. Publishers complete KYC or KYB.
- **Publisher wallet:** a desktop browser-extension wallet, not a Ledger. It signs every release and update, so treat it like the keystore.
- **Cost:** about 0.05–0.1 SOL per release, plus ArDrive storage for the uploaded files.
- **Package:** a signed release APK only. The store does not take an Android App Bundle (AAB).
- **Text:** an app name of up to 25 characters and a subtitle of up to 30.
- **Graphics:** the 512×512 icon (`public/icons/icon-512.png`), a banner of exactly 1200×600, and 4–8 portrait screenshots at least 1080 px wide.
- **Review:** usually 3–5 business days.

## Decisions to make before the first publish

- **Application ID is permanent.** This shell uses `dev.lotline.app`. Change it now (`WEB_SHELL_APPLICATION_ID` in `android/gradle.properties`) or never.
- **Host is pinned.** The shell keeps navigation on `lotline.dev` and opens other hosts in the system browser. Moving to a custom domain later needs a rebuild but keeps the application ID.
- **Deep links.** The shell opens the start URL. Markets links a single asset into the planner as `/app?add=<mint>`. If you want those links to open the app, add an intent filter for the host in `android/app/src/main/AndroidManifest.xml`.

## CLOCK IN checklist (Solana Mobile × RadiantsDAO, closes 8 October 2026)

- [ ] Release APK built with the steps above and installed on a Seeker or Android device
- [ ] Public GitHub repo (this one), with this branch merged
- [ ] Demo video showing the install, the wallet handoff and the core flow on a phone
- [ ] Pitch deck: problem, product, why mobile-first, traction, team
- [ ] Optional SKR integration for the separate $10K SKR prize
