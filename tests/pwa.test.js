import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PWA environment routing', () => {
    let listeners;
    let serviceWorker;

    beforeEach(() => {
        vi.resetModules();
        listeners = new Map();
        serviceWorker = {
            register: vi.fn().mockResolvedValue({}),
            getRegistrations: vi.fn().mockResolvedValue([]),
        };
        vi.stubGlobal('navigator', { serviceWorker });
        vi.stubGlobal('document', {
            querySelector: () => ({ href: 'https://duevinci.tech/manifest.json' }),
            getElementById: () => null,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function setLocation(url) {
        const location = new URL(url);
        vi.stubGlobal('window', {
            location,
            addEventListener: (name, listener) => listeners.set(name, listener),
        });
        document.querySelector = () => ({ href: new URL('/manifest.json', location).href });
    }

    it.each(['localhost', '127.0.0.1', '[::1]'])('cleans only the DueVinci worker on %s', async (hostname) => {
        setLocation(`http://${hostname}:5173/nursing/index.html`);
        const own = {
            active: { scriptURL: new URL('/sw.js', window.location).href },
            unregister: vi.fn().mockResolvedValue(true),
        };
        const unrelated = {
            active: { scriptURL: new URL('/another-app/sw.js', window.location).href },
            unregister: vi.fn().mockResolvedValue(true),
        };
        serviceWorker.getRegistrations.mockResolvedValue([own, unrelated]);

        await import('../js/modules/pwa.js');
        await vi.waitFor(() => expect(own.unregister).toHaveBeenCalledOnce());

        expect(unrelated.unregister).not.toHaveBeenCalled();
        expect(serviceWorker.register).not.toHaveBeenCalled();
        expect(listeners.has('load')).toBe(false);
    });

    it('registers the production root worker from a nested route', async () => {
        setLocation('https://duevinci.tech/nursing/index.html');
        await import('../js/modules/pwa.js');
        listeners.get('load')();

        expect(serviceWorker.register).toHaveBeenCalledWith('https://duevinci.tech/sw.js', { updateViaCache: 'none' });
        expect(serviceWorker.getRegistrations).not.toHaveBeenCalled();
    });

    it('loads without service-worker support', async () => {
        setLocation('https://duevinci.tech/');
        vi.stubGlobal('navigator', {});

        await expect(import('../js/modules/pwa.js')).resolves.toBeDefined();
        expect(listeners.has('load')).toBe(false);
    });

    it('reports a local cleanup failure without breaking initialization', async () => {
        setLocation('http://localhost:5173/');
        const error = new Error('Browser storage unavailable');
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        serviceWorker.getRegistrations.mockRejectedValue(error);

        await import('../js/modules/pwa.js');
        await vi.waitFor(() => expect(log).toHaveBeenCalledWith('Local service worker cleanup skipped:', error));

        expect(serviceWorker.register).not.toHaveBeenCalled();
    });
});
