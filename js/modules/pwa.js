// --- PWA INSTALLATION & SERVICE WORKER LIFECYCLE MODULE ---

let deferredPWAInstallPrompt = null;

export function initPWA() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPWAInstallPrompt = e;

        if (localStorage.getItem('duevinci_pwa_dismissed') !== 'true') {
            const banner = document.getElementById('pwaInstallBanner');
            if (banner) banner.classList.remove('hidden');
        }
    });

    window.addEventListener('appinstalled', () => {
        deferredPWAInstallPrompt = null;
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) banner.classList.add('hidden');
    });

    // Register from the manifest directory so dashboard and nested pages use
    // the same root service worker (for example /courses/ must not seek
    // /courses/sw.js).
    const hostname = typeof window !== 'undefined'
        ? String(window.location?.hostname || '').replace(/^\[|\]$/g, '')
        : '';
    const isLocalPreview = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !window.location.protocol.startsWith('http')) return;
    const manifestHref = document.querySelector('link[rel="manifest"]')?.href || new URL('manifest.json', window.location.href).href;
    const serviceWorkerUrl = new URL('sw.js', manifestHref).href;
    if (isLocalPreview) {
        // A previously installed app-shell worker can serve stale ESM modules
        // during local development. Remove only DueVinci's worker, preserving
        // unrelated applications served from another path on the same origin.
        navigator.serviceWorker.getRegistrations()
            .then((registrations) => Promise.all(registrations
                .filter((registration) => [registration.active, registration.waiting, registration.installing]
                    .some((worker) => worker?.scriptURL === serviceWorkerUrl))
                .map((registration) => registration.unregister())))
            .catch((err) => console.log('Local service worker cleanup skipped:', err));
        return;
    }

    window.addEventListener('load', () => {
        // Always revalidate the worker script so a release can invalidate
        // an installed app-shell cache without waiting for CDN max-age.
        navigator.serviceWorker.register(serviceWorkerUrl, { updateViaCache: 'none' }).catch(err => {
            console.log('SW registration error:', err);
        });
    });
}

export async function triggerPWAInstall() {
    if (!deferredPWAInstallPrompt) {
        alert('To install DueVinci, use your browser\'s "Install App" or "Add to Home Screen" menu option.');
        return;
    }

    deferredPWAInstallPrompt.prompt();
    const { outcome } = await deferredPWAInstallPrompt.userChoice;
    if (outcome === 'accepted') {
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) banner.classList.add('hidden');
    }
    deferredPWAInstallPrompt = null;
}

export function dismissPWABanner() {
    if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_pwa_dismissed', 'true');
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.classList.add('hidden');
}

// Bind to window
if (typeof window !== 'undefined') {
    window.triggerPWAInstall = triggerPWAInstall;
    window.dismissPWABanner = dismissPWABanner;
    window.initPWA = initPWA;

    initPWA();
}
