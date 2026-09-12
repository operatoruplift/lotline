/* Lotline stores only a public synthetic Example and static application assets.
 * Live API requests, account pages, authentication, and user documents never
 * enter Cache Storage. The Example is refreshed atomically when online.
 */
const CACHE = 'lotline-public-example-v3';
const OFFLINE = '/offline';
const STATIC_PATHS = ['/brand/', '/icons/', '/logos/', '/_next/static/'];
const STATIC_FILES = new Set(['/favicon.ico', '/icon.svg', '/apple-icon.png']);
let preparing;

function isStatic(url) {
  return url.origin === self.location.origin && (STATIC_FILES.has(url.pathname) || STATIC_PATHS.some((path) => url.pathname.startsWith(path)));
}

async function prepareOffline() {
  if (preparing) return preparing;
  preparing = (async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(OFFLINE, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Offline Example unavailable.');
    const html = await response.clone().text();
    // Read only public same-origin static URLs; never precache a linked route,
    // image optimizer URL, API, third-party host, or authentication response.
    const paths = new Set(['/icons/icon-192.png?v=branch-1', '/icons/icon-512.png?v=branch-1', '/icons/icon-maskable-512.png?v=branch-1', '/icons/apple-touch-icon.png?v=branch-1', '/brand/mark.svg?v=branch-1', '/brand/favicon.svg?v=branch-1', '/logos/xstocks/AAPLx.png', '/logos/xstocks/MSFTx.png', '/logos/xstocks/NVDAx.png', '/logos/xstocks/TSLAx.png', '/logos/xstocks/SPYx.png', '/logos/xstocks/QQQx.png']);
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = new URL(match[1].replaceAll('&amp;', '&'), self.location.origin);
      if (isStatic(url)) paths.add(url.pathname + url.search);
    }
    await Promise.all([...paths].map(async (path) => {
      const asset = await fetch(path, { credentials: 'omit', cache: 'reload', redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (!asset.ok) throw new Error('Offline asset unavailable.');
      await cache.put(path, asset);
    }));
    // Keep the previous working document if any required asset failed.
    await cache.put(OFFLINE, response);
    // Retain recent chunks for already-open tabs, but bound growth across many
    // releases. Never evict any asset needed by the newly committed Example.
    const current = new Set([...paths, OFFLINE].map((path) => new URL(path, self.location.origin).href));
    const entries = await cache.keys();
    let remaining = entries.length;
    for (const entry of entries) {
      if (remaining <= 96) break;
      if (!current.has(entry.url)) { await cache.delete(entry); remaining -= 1; }
    }
  })().finally(() => { preparing = undefined; });
  return preparing;
}

self.addEventListener('install', (event) => {
  event.waitUntil(prepareOffline().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('lotline-public-example-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'LOTLINE_PREPARE_OFFLINE' || !event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  event.waitUntil((async () => {
    try {
      await prepareOffline();
      event.source.postMessage({ type: 'LOTLINE_OFFLINE_READY' });
    } catch {
      const cached = await caches.match(OFFLINE, { cacheName: CACHE });
      event.source.postMessage({ type: cached ? 'LOTLINE_OFFLINE_READY' : 'LOTLINE_OFFLINE_UNAVAILABLE' });
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Only public document navigations get a synthetic offline fallback. Next
  // RSC requests are deliberately network-only to avoid a cached private tree.
  const publicPage = ['/', '/app', '/how-it-works', OFFLINE].includes(url.pathname);
  if (request.mode === 'navigate' && publicPage) {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE, { cacheName: CACHE });
      return cached || new Response('Lotline is offline. Reconnect once to prepare the Example planner.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
    return;
  }
  if (isStatic(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: CACHE });
      if (cached) return cached;
      // Only assets belonging to the preloaded Example are persisted. Other
      // pages can load normally without making their contents available offline.
      return fetch(request);
    })());
  }
});
