// FuelOps Service Worker
// STRATEGY (fixes "old version stuck in PWA cache" issue):
//  - App shell (HTML/JS/CSS/manifest) => NETWORK-FIRST. Always tries the network
//    first so users get the latest deployed code immediately when online.
//    Falls back to cache only when offline / network fails.
//  - Static assets (icons etc) => CACHE-FIRST (rarely change, safe to cache hard).
//  - CACHE_NAME is injected by scripts/bump-sw-version.js on every commit/deploy,
//    so you never need to hand-edit a version string again - every push
//    automatically busts old caches for every user.
const CACHE_NAME = 'fuelops-20260916-75f4cba808';

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
];

// Static, rarely-changing assets - safe to cache-first
const STATIC_ASSETS = [
  './assets/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([...APP_SHELL, ...STATIC_ASSETS]).catch(err => {
        console.warn('[SW] Cache addAll failed', err);
        return Promise.allSettled([...APP_SHELL, ...STATIC_ASSETS].map(url => cache.add(url).catch(()=>{})));
      });
    })
  );
  // Do NOT auto skipWaiting here - let the page decide (see message handler below)
  // so we can show an "update available" prompt instead of silently swapping code
  // under an active user's feet.
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting SW to activate immediately (user clicked "Refresh")
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isAppShellRequest(url) {
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
    return false;
  }
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip Firebase / CDN requests entirely - never cache, always network
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
    return;
  }

  if (req.method !== 'GET') return;

  const isStatic = STATIC_ASSETS.some(a => url.pathname.endsWith(a.replace('./','/')));

  if (isStatic) {
    // Cache-first for static, rarely-changing assets
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)); }
        return res;
      }))
    );
    return;
  }

  // Navigation requests (SPA) - network-first so users always get latest index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin app shell (JS/CSS) - network-first, cache as offline fallback only
  if (isAppShellRequest(url)) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
