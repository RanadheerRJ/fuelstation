// FuelOps Service Worker - PROD FINAL - single super admin, 10-digit, Dev vs User, Firebase real
const CACHE_NAME = 'fuelops-v15-superadmin-delete-reset-20260913';
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
  './js/views/login.js',
  './js/views/dashboard.js',
  './js/views/stations.js',
  './js/views/pumps.js',
  './js/views/employees.js',
  './js/views/prices.js',
  './js/views/shifts.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/superAdmin.js',
  './js/views/devSetup.js',
  './assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('[SW] Cache addAll failed', err);
        // Try individually
        return Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(()=>{})));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip Firebase requests, don't cache
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
    return;
  }

  // For navigation requests, serve index.html (SPA) - hash routing works offline
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => {
        return cached || fetch(req).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Cache-first for same-origin assets
  if (url.origin === self.location.origin || url.pathname.startsWith(self.location.pathname.replace('service-worker.js',''))) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          // Cache successful GETs
          if (req.method === 'GET' && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        }).catch(() => {
          // offline fallback
          return cached;
        });
      })
    );
  }
});
