// Offline app shell. Bump VERSION whenever any cached file changes, or phones keep the old copy.
const VERSION = 'parcel-v0.1.0';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/app.js', 'src/finance.js', 'src/areas.js', 'src/store.js', 'src/geo.js',
  'data/areas.json', 'data/boundaries.geojson', 'data/seed-properties.json',
  'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Same-origin files: network first so updates show up, cache as the offline fallback.
// Map tiles and address lookups (other origins) are left to the browser.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request)));
});
