// FuelOps Service Worker
//
// Caching strategy (changed 2026-09: devices were pinned to old UI forever)
// -------------------------------------------------------------------------
// The previous worker was cache-first for every same-origin asset: once a JS
// file landed in the cache it was served from there indefinitely and the
// network was never consulted. A version bump only helped if the device
// happened to re-fetch this script, so some devices stayed on stale UI.
//
// Now:
//   - HTML + JS + CSS  -> NETWORK FIRST. Fresh when online, cache only as an
//                         offline fallback. This is the fix.
//   - icons / images   -> cache first (they are immutable and heavy).
//   - Firebase traffic -> never touched.
//
// The app is small and served over HTTP/2, so network-first costs little and
// removes a whole class of "why am I seeing the old screen" bugs.

const VERSION = 'v50-network-first-20260914';
const CACHE_NAME = `fuelops-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/firebase-config.js',
  './js/firebase.js',
  './js/state.js',
  './js/router.js',
  './js/auth.js',
  './js/services/calc.js',
  './js/services/money.js',
  './js/services/stock.js',
  './js/services/datetime.js',
  './js/services/demoStore.js',
  './js/services/firestoreService.js',
  './js/services/stations.js',
  './js/services/pumps.js',
  './js/services/users.js',
  './js/services/prices.js',
  './js/services/shifts.js',
  './js/services/transactions.js',
  './js/services/notes.js',
  './js/services/reports.js',
  './js/services/collections.js',
  './js/views/login.js',
  './js/views/dashboard.js',
  './js/views/stations.js',
  './js/views/teamDirectory.js',
  './js/views/pumps.js',
  './js/views/employees.js',
  './js/views/prices.js',
  './js/views/shifts.js',
  './js/views/collections.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/superAdmin.js',
  './js/views/devSetup.js',
  './assets/icons/icon.svg'
];

// Treat these as "code": always try the network first.
const isCodeRequest = (url, req) =>
  req.mode === 'navigate' ||
  /\.(html|js|mjs|css|json)$/i.test(url.pathname);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // { cache: 'reload' } bypasses the browser HTTP cache, so installing a new
    // version can never bake in a stale copy of a file.
    await Promise.allSettled(
      APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })))
    );
  })());
  // Take over immediately rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache that is not the current one.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));

    // Navigation preload shaves latency off network-first navigations.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    await self.clients.claim();

    // Tell open tabs a new version is live so they can reload themselves.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: VERSION }));
  })());
});

// Allow the page to force activation of a waiting worker.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    // Reply down the MessagePort when one was supplied, else to the client.
    const reply = { type: 'VERSION', version: VERSION };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else event.source?.postMessage(reply);
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Never intercept Firebase/Google traffic - it handles its own freshness.
  if (/(firebase|firestore|googleapis|gstatic|google)\./i.test(url.hostname)) return;

  // Only handle our own origin.
  if (url.origin !== self.location.origin) return;

  if (isCodeRequest(url, req)) {
    event.respondWith(networkFirst(event));
    return;
  }

  event.respondWith(cacheFirst(req));
});

/**
 * Network first: always prefer a fresh copy, fall back to cache when offline.
 * A navigation that misses entirely falls back to the cached shell so hash
 * routing still works with no connection.
 */
async function networkFirst(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);

  try {
    const preload = await event.preloadResponse;
    const res = preload || await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html') || await cache.match('./');
      if (shell) return shell;
    }
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/** Cache first, for immutable assets like icons. Refreshes in the background. */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) {
    refreshInBackground(cache, req);
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

function refreshInBackground(cache, req) {
  fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); }).catch(()=>{});
}
