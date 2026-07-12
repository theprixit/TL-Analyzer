/* TL-SAG Service Worker — offline-first app shell.
 * RELEASE CHECKLIST: bump SW_VERSION together with APP_VERSION and the
 * ?v= asset tags in index.html — the cache name derives from it.
 */
const SW_VERSION = '0.11.10-beta';
const CACHE_NAME = 'tlsag-' + SW_VERSION;
const FONT_CACHE = 'tlsag-fonts';

const PRECACHE = [
  './',
  './index.html',
  './style.css?v=' + SW_VERSION,
  './engine.js?v=' + SW_VERSION,
  './app.js?v=' + SW_VERSION,
  './phototracker.js?v=' + SW_VERSION,
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-v2.png',
  './explanations.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('tlsag-') && k !== CACHE_NAME && k !== FONT_CACHE)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache-first (opaque-friendly), so typography works offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          cache.put(req, res.clone());
          return res;
        }).catch(() => hit))
      )
    );
    return;
  }

  // Same-origin: stale-while-revalidate — instant from cache, refreshed in
  // the background, and fully functional offline after the first visit.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(hit => {
          const refresh = fetch(req).then(res => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || refresh;
        })
      )
    );
  }
});
