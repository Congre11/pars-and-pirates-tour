/*
 * Pars & Pirates Tour — service worker.
 *
 * Deliberately minimal. Its only job is to keep the app shell openable when
 * the signal dies on the back nine, and to make the app installable to the
 * iPhone home screen.
 *
 * It does NOT cache API responses or scores. Stale scores are worse than no
 * scores, and durable score writes are handled by the app's own queue in
 * localStorage, which survives a force-quit.
 */

const CACHE = 'pars-pirates-shell-v1';
const PRECACHE = ['/', '/leaderboard', '/itinerary', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve API traffic from cache — scores and sessions must be live.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, cache as the safety net.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Static assets: cache first, they are content-hashed by Next.js.
  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            return response;
          }),
      ),
    );
  }
});
