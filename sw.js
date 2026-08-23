// DueVinci Service Worker - Offline Caching
// Bump this whenever the precached application shell changes so installed PWAs
// receive the current planner and workload logic after activation.
const CACHE_NAME = 'duevinci-v4.7';
const RUNTIME_CACHE = 'duevinci-runtime-v1';
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
  './js/modules/preferences.js',
  './js/modules/errorReporting.js',
  './js/modules/ui.js',
  './js/modules/canvas.js',
  './assets/vendor/tailwindcss.js',
  './assets/vendor/supabase-js.js',
  './assets/vendor/driver.js',
  './assets/vendor/driver.css',
  './assets/vendor/fullcalendar.js',
  './assets/vendor/canvas-confetti.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // An optional asset failing to cache must not prevent the PWA shell from
      // installing. Cache as much of the shell as is available.
      await Promise.allSettled(ASSETS_TO_CACHE.map((asset) => cache.add(asset)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request.url.startsWith('http') || request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache authenticated Supabase API or Edge Function responses.
  if (url.hostname.endsWith('.supabase.co')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((cached) => {
        // Planner pages are static. Serve the cached document immediately and
        // refresh it in the background; waiting for an offline fetch timeout
        // made page switches feel broken for roughly 15 seconds.
        if (cached) {
          event.waitUntil(fetch(request).then((response) => {
            if (response.ok) return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }).catch(() => {}));
          return cached;
        }
        return fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => caches.match('./index.html'));
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok || response.type === 'opaque') {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
