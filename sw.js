/* Offline support for The List.
   - App shell (HTML, JS, map data, icons): served from cache, refreshed in the background,
     so a new deploy shows up on the next launch.
   - Photos in img/ and Google Fonts: cache first; they never change.
   - Everything else (Wikipedia/Wikivoyage lookups): network only.
   Bump VERSION when the list of shell files changes. */
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const MEDIA = 'media-v1';
const SHELL_FILES = [
  './', './index.html', './map.js', './social.js', './wrapped.js', './countries.json',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== MEDIA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const cacheFirst = async (req, name) => {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(name)).put(req, res.clone());
  return res;
};
const staleWhileRevalidate = async req => {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/img/')) return e.respondWith(cacheFirst(req, MEDIA));
    // Navigations (any #route) all resolve to the app shell
    if (req.mode === 'navigate') return e.respondWith(staleWhileRevalidate(new Request('./index.html')));
    return e.respondWith(staleWhileRevalidate(req));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(cacheFirst(req, MEDIA));
});
