// DueVinci Service Worker - Offline Caching
const CACHE_NAME = 'duevinci-v2.2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './courses.html',
  './grades.html',
  './calendar.html',
  './privacy.html',
  './terms.html',
  './app.js',
  './timers.js',
  './academics.js',
  './manifest.json',
  './maestro-logo.svg',
  './maestro-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle http/https requests
  if (!event.request.url.startsWith('http')) return;
  
  // Network first, falling back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and store in cache if valid GET request
        if (event.request.method === 'GET' && response.status === 200 && response.type === 'basic') {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
