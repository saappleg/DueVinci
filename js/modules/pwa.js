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

    // Service Worker Registration
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => {
                console.log('SW registration error:', err);
            });
        });
    }
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
