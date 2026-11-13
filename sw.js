/* Offline support for The List.
   - App files (HTML, JS, map data, manifest): network first, so a new deploy shows up on the next
     launch; the cached copy is used when offline or when the network is too slow (3s).
   - Photos in img/, icons and Google Fonts: cache first; they never change.
   - Everything else (Wikipedia/Wikivoyage lookups): network only.
   Bump VERSION on every deploy: a changed sw.js is what tells installed apps to update. */
const VERSION = 'v17';
const SHELL = `shell-${VERSION}`;
const MEDIA = 'media-v1';
const SHELL_FILES = [
  './', './index.html', './map.js', './social.js', './wrapped.js', './goals.js', './countries.json',
  './lib/supabase.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache so the new version really is fetched fresh
  e.waitUntil(caches.open(SHELL)
    .then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
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
const networkFirst = async (req, key = req) => {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, no) => setTimeout(() => no(new Error('slow')), 3000)),
    ]);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key, { ignoreSearch: true })) || Response.error();
  }
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/img/') || url.pathname.includes('/icons/')) return e.respondWith(cacheFirst(req, MEDIA));
    // Navigations (any #route) all resolve to the app shell
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req, './index.html'));
    return e.respondWith(networkFirst(req));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(cacheFirst(req, MEDIA));
});
