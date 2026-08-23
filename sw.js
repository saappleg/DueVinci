// DueVinci Service Worker - Offline Caching
// Bump this whenever the precached application shell changes so installed PWAs
// receive the current planner and workload logic after activation.
const CACHE_NAME = 'duevinci-v3.3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './courses/index.html',
  './grades/index.html',
  './calendar/index.html',
  './legal/privacy.html',
  './legal/terms.html',
  './assets/css/greek-theme.css',
  './assets/css/renaissance-theme.css',
  './manifest.json',
  './assets/images/maestro-logo.svg',
  './assets/images/maestro-logo.png',
  './assets/images/wgu-owl.png',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/favicon.ico',
  './js/app.js',
  './js/modules/config.js',
  './js/modules/utils.js',
  './js/modules/auth.js',
  './js/modules/academics.js',
  './js/modules/timers.js',
  './js/modules/courses.js',
  './js/modules/grades.js',
  './js/modules/calendar.js',
  './js/modules/flashcards.js',
  './js/modules/markdown.js',
  './js/modules/studyPlan.js',
  './js/modules/offlineDb.js',
  './js/modules/components.js',
  './js/modules/backup.js',
  './js/modules/tour.js',
  './js/modules/easterEggs.js',
  './js/modules/pwa.js',
  './js/modules/ui.js'
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
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
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
