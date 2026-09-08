// OAuth callbacks are navigation requests (their fragment never reaches the
// server). A stale cached index can reference incompatible hashed chunks and
// leave an iPhone Safari tab blank, so navigation is network-first.
const CACHE_PREFIX = 'football-tracker-';
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const BASE_PATH = '/football-tracker/';
const APP_SHELL = `${BASE_PATH}index.html`;
const STATIC_ASSETS = [
  BASE_PATH,
  APP_SHELL,
  `${BASE_PATH}favicon.svg`,
  `${BASE_PATH}manifest.json`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(APP_SHELL, response.clone()));
      return response;
    }).catch(() => caches.match(APP_SHELL)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
