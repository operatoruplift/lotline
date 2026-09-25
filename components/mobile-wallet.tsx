'use client';

import { useEffect } from 'react';

// Registers the Solana Mobile Wallet Adapter as a Wallet Standard wallet so the
// existing wallet picker in execution-review.tsx can offer Seed Vault Wallet,
// Phantom, Solflare and other MWA-compatible wallets on Android and Seeker.
//
// The adapter is loaded lazily and only registers itself in a secure context on
// a device that supports local association (Android Chrome, the Solana Mobile
// Web Shell). Desktop browsers, iOS and in-wallet browsers are left untouched:
// the adapter logs a warning and registers nothing. No data is collected.
let registered = false;

export function MobileWalletSupport() {
  useEffect(() => {
    if (registered || typeof window === 'undefined') return;
    registered = true;
    import('@solana-mobile/wallet-standard-mobile')
      .then((mwa) => {
        mwa.registerMwa({
          appIdentity: { name: 'Lotline', uri: window.location.origin, icon: 'icons/icon-192.png' },
          authorizationCache: mwa.createDefaultAuthorizationCache(),
          chains: ['solana:mainnet'],
          chainSelector: mwa.createDefaultChainSelector(),
          onWalletNotFound: mwa.createDefaultWalletNotFoundHandler(),
        });
      })
      .catch(() => {
        // The planner keeps working without a mobile wallet; the empty wallet
        // state already explains the next step.
        registered = false;
      });
  }, []);
  return null;
}
