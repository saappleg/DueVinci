// DueVinci Service Worker - Offline Caching
// Bump this whenever the precached application shell changes so installed PWAs
// receive the current planner and workload logic after activation.
const CACHE_NAME = 'duevinci-v7.4';
const RUNTIME_CACHE = 'duevinci-runtime-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './courses/index.html',
  './grades/index.html',
  './calendar/index.html',
  './tutor/index.html',
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
  './js/modules/profileAvatar.js',
  './js/modules/components.js',
  './js/modules/backup.js',
  './js/modules/tour.js',
  './js/modules/reminders.js',
  './js/modules/today.js',
  './js/modules/tutor.js',
  './js/modules/weeklyReview.js',
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
  './assets/vendor/canvas-confetti.js',
  './assets/vendor/pdf.js',
  './assets/vendor/pdf.worker.js',
  './assets/vendor/tesseract.js'
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

self.addEventListener('push', (event) => {
  let payload = { title: 'DueVinci reminder', body: 'You have coursework coming up.' };
  try { payload = { ...payload, ...(event.data ? event.data.json() : {}) }; } catch { /* Keep the safe fallback. */ }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: './assets/icons/icon-192x192.png',
    badge: './assets/icons/icon-192x192.png',
    data: { url: './index.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || './index.html'));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request.url.startsWith('http') || request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache authenticated Supabase API or Edge Function responses.
  if (url.hostname.endsWith('.supabase.co')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // Directory navigation (for example /courses/) does not have the
        // same request URL as the pre-cached /courses/index.html document.
        // Resolve every app route before attempting the network.
        const route = new URL(request.url).pathname.replace(/\/+$/, '');
        const routeAsset = route.endsWith('/courses') ? './courses/index.html'
          : route.endsWith('/grades') ? './grades/index.html'
            : route.endsWith('/calendar') ? './calendar/index.html'
              : route.endsWith('/tutor') ? './tutor/index.html'
              : route.endsWith('/legal/privacy') ? './legal/privacy.html'
                : route.endsWith('/legal/terms') ? './legal/terms.html'
                  : './index.html';
        const cached = (await caches.match(request)) || await caches.match(routeAsset);
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
          .catch(() => caches.match(routeAsset));
      })(),
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
