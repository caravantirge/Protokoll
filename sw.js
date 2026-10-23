/* Service Worker: macht die App offline-fähig.
   Es werden NUR die App-Dateien zwischengespeichert – niemals Protokolldaten
   (die liegen ausschließlich im localStorage des Geräts). */
const CACHE = 'protokoll-v4';
const ASSETS = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: sofort aus dem Cache (funktioniert offline),
// im Hintergrund die neueste Version holen, wenn Netz da ist.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(handle(e, req));
});

async function handle(e, req) {
  const cache = await caches.open(CACHE);
  let cached = await cache.match(req, { ignoreSearch: true });
  if (!cached && req.mode === 'navigate') cached = await cache.match('./index.html');
  const net = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    e.waitUntil(net);
    return cached;
  }
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') {
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
  }
  return Response.error();
}
