// Serves the app's own files when offline. Same-origin GET requests only:
// user images are read from disk by the browser and never pass through here.
const CACHE = 'mosaic-builder-v1';
// A server's Vary header would otherwise make a stored file miss for a slightly different request.
const MATCH = { ignoreVary: true };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return;
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(event.data.urls).catch(() => undefined)));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  const isAsset = url.pathname.includes('/assets/');
  if (isAsset) {
    // Build asset names contain a content hash, so a cached copy is always right.
    event.respondWith(
      caches.match(request, MATCH).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Pages and icons: newest when online, cached when not.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request, MATCH)
          .then((hit) => hit ?? caches.match('./', MATCH))
          .then((hit) => hit ?? Response.error()),
      ),
  );
});
