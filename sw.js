/* fc service worker — offline support for the installable PWA.
 *
 * Strategy, tuned to fc being a frequently-updated SINGLE-FILE app:
 *   - HTML / navigations  -> NETWORK-FIRST (cache fallback). Online users always
 *                            get the latest index.html; offline they get the last
 *                            good copy. This is what prevents the classic "PWA
 *                            pinned me to a stale version" trap.
 *   - static sub-assets    -> STALE-WHILE-REVALIDATE (instant from cache, refreshed
 *                            in the background): docs/, learn/, examples/*.fc, icons.
 *   - /api/* and non-GET   -> never intercepted (auth, publish, community must hit
 *                            the network live; nothing user-specific is cached).
 *   - /fc.apk              -> never cached (44MB binary).
 *
 * Bump VERSION to force-evict all old caches on the next visit.
 */
const VERSION = 'v3.3.0';
const CORE = 'fc-core-' + VERSION;
const RUNTIME = 'fc-runtime-' + VERSION;

const CORE_ASSETS = [
  '/', '/index.html', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
  '/docs/', '/learn/',
  '/examples/snake.fc', '/examples/pong.fc', '/examples/breakout.fc',
  '/examples/flappy.fc', '/examples/space-invaders.fc', '/examples/pitfall.fc',
  '/examples/coin-quest.fc', '/examples/hunt.fc', '/examples/mp-dots.fc'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE)
      // addAll is atomic; if one asset 404s the whole install fails, so cache
      // them individually and tolerate misses.
      .then((c) => Promise.all(CORE_ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CORE && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // auth/publish/delete -> live
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 3rd-party (fonts, github api) -> live
  if (url.pathname.startsWith('/api/')) return;     // dynamic API -> always live
  if (url.pathname === '/fc.apk') return;           // big binary -> let network handle

  const isHtml = req.mode === 'navigate' || req.destination === 'document' ||
                 url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  e.respondWith(isHtml ? networkFirst(req) : staleWhileRevalidate(req));
});

// Network-first; cache under a query-stripped key so ?code=... links don't bloat
// the cache, and fall back to the app shell when fully offline.
async function networkFirst(req) {
  const url = new URL(req.url);
  const key = url.origin + url.pathname;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      const c = await caches.open(CORE);
      c.put(key, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(key) ||
                   await caches.match('/index.html') ||
                   await caches.match('/');
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const fetching = fetch(req)
    .then((res) => { if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || (await fetching) || new Response('', { status: 504, statusText: 'offline' });
}

// Let the page trigger an immediate update (used after registration finds a new SW).
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
