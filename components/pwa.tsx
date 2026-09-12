'use client';

import { useLayoutEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import styles from './pwa.module.css';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser can dispatch beforeinstallprompt before React finishes hydrating
// the support panel. Capture it at module load so the install action never
// loses a prompt during that short handoff window.
let pendingInstallPrompt: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingInstallPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event('lotline-install-prompt'));
  });
}

export function PwaSupport() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(() => pendingInstallPrompt);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [offline, setOffline] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState('');
  const [cacheState, setCacheState] = useState<'pending' | 'ready' | 'unavailable'>('pending');

  useLayoutEffect(() => {
    let active = true;
    let expectedWorker: ServiceWorker | null = null;
    let preparationTimer: ReturnType<typeof setTimeout> | undefined;
    const display = window.matchMedia('(display-mode: standalone)');
    const updateInstalled = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const updateNetwork = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) expectedWorker?.postMessage({ type: 'LOTLINE_PREPARE_OFFLINE' });
    };
    const onPrompt = (event: Event) => { event.preventDefault(); pendingInstallPrompt = event as InstallPromptEvent; setInstallPrompt(pendingInstallPrompt); };
    const onPromptCaptured = () => { if (pendingInstallPrompt) setInstallPrompt(pendingInstallPrompt); };
    const onInstalled = () => { setInstalled(true); pendingInstallPrompt = null; setInstallPrompt(null); setInstructions(false); };
    const onWorkerMessage = (event: MessageEvent) => {
      // A just-activated worker can answer before clients.claim() triggers the
      // first controllerchange event. Accept that exact registered worker too.
      if ((event.source !== navigator.serviceWorker.controller && event.source !== expectedWorker) || !active) return;
      if (!['LOTLINE_OFFLINE_READY', 'LOTLINE_OFFLINE_UNAVAILABLE'].includes(event.data?.type)) return;
      clearTimeout(preparationTimer);
      if (event.data?.type === 'LOTLINE_OFFLINE_READY') setCacheState('ready');
      if (event.data?.type === 'LOTLINE_OFFLINE_UNAVAILABLE') setCacheState('unavailable');
    };

    queueMicrotask(() => {
      if (!active) return;
      updateInstalled(); updateNetwork();
      setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
      if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) { setCacheState('unavailable'); return; }
      preparationTimer = setTimeout(() => { if (active) setCacheState('unavailable'); }, 45_000);
      // No device permissions, notification subscription, or private data are used.
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          if (!active) return;
          expectedWorker = registration.active;
          expectedWorker?.postMessage({ type: 'LOTLINE_PREPARE_OFFLINE' });
        })
        .catch(async () => {
          // Updating a registered worker can fail offline while its previous
          // public cache is still perfectly usable.
          const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
          if (!active) return;
          expectedWorker = registration?.active ?? null;
          if (expectedWorker) expectedWorker.postMessage({ type: 'LOTLINE_PREPARE_OFFLINE' });
          else { clearTimeout(preparationTimer); setCacheState('unavailable'); }
        });
    });
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('lotline-install-prompt', onPromptCaptured);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    display.addEventListener('change', updateInstalled);
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => {
      active = false;
      clearTimeout(preparationTimer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('lotline-install-prompt', onPromptCaptured);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      display.removeEventListener('change', updateInstalled);
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, []);

  async function install() {
    if (!installPrompt) { setInstructions(!instructions); return; }
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setMessage(choice.outcome === 'accepted' ? 'Installation accepted. Look for Lotline on your device.' : 'You can install Lotline later from your browser menu.');
      pendingInstallPrompt = null;
      setInstallPrompt(null);
    } catch { setInstructions(true); setMessage('Use your browser menu to install Lotline.'); }
    finally { setInstalling(false); }
  }

  return <>
    {!installed && <aside id="install-lotline" className={styles.install} aria-label="Install Lotline">
      <div className={styles.inner}>
        <div className={styles.copy}><strong>Your plan, one tap away.</strong><span>Add Lotline to your phone or desktop.</span></div>
        <button className={styles.button} type="button" onClick={install} disabled={installing} aria-expanded={instructions} aria-controls="lotline-install-help"><Download size={16} aria-hidden="true" />{installing ? 'Opening install prompt…' : 'Install Lotline'}</button>
      </div>
      <div id="lotline-install-help" className={instructions ? styles.instructions : undefined} hidden={!instructions}>
        <h2>Keep Lotline on your device</h2>
        {isIos ? <p>On iPhone or iPad, open this site in Safari. Tap Share, then Add to Home Screen and Add. Turn on Open as Web App if Safari offers it.</p> : <p>In Chrome or Edge, use the install icon in the address bar or the browser menu’s Install app option. In Safari on Mac, choose File → Add to Dock. If your browser does not offer installation, bookmark Lotline for quick access.</p>}
        <p>Live estimates and account sync need an internet connection. The <a href="/offline">Example planner</a> uses synthetic data and can be saved for offline use.</p>
        <p className={styles.hint}>{cacheState === 'ready' ? 'The Example is ready to use offline on this device.' : cacheState === 'unavailable' ? 'Offline storage is not ready. Open the Example online and try again; your browser may restrict storage.' : 'Preparing the Example for offline use…'}</p>
        <button className={styles.button} type="button" onClick={() => setInstructions(false)}>Close instructions</button>
      </div>
      {message && <p className={styles.hint} role="status">{message}</p>}
    </aside>}
    {installed && <aside id="install-lotline" className={styles.install} aria-label="Lotline is installed"><div className={styles.inner}><div className={styles.copy}><strong>Lotline is installed.</strong><span>Your planner is ready on this device.</span></div><a className={styles.button} href="/offline">Open the Example</a></div></aside>}
    {offline && <div className={styles.banner} role="status"><WifiOff size={16} aria-hidden="true" /><span>You’re offline. Live estimates and sync are paused.</span><a href="/offline">Open offline Example</a></div>}
  </>;
}
