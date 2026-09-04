const CACHE_NAME = 'sendlog-v2-4';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'app_icon.png',
  'fix_tool.html',
  'js/app.js',
  'js/chart.js',
  'js/gdrive.js',
  'js/planner.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Failed to cache asset:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for external API calls, Google Identity, and Dreamlo/CORS proxies
  if (
    url.hostname.includes('dreamlo.com') ||
    url.hostname.includes('sirjosh.workers.dev') ||
    url.hostname.includes('cors.sh') ||
    url.hostname.includes('codetabs.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return;
  }

  // Stale-While-Revalidate strategy for internal assets and CDNs
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return cache.match('index.html');
          }
          return null;
        });

      if (cachedResponse) {
        return cachedResponse;
      }

      const networkResponse = await fetchPromise;
      if (networkResponse) {
        return networkResponse;
      }

      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('index.html');
        if (fallback) return fallback;
      }

      return new Response('Offline: resource not available in cache.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    })
  );
});
