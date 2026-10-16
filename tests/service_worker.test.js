import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function createWorker() {
    const handlers = new Map();
    const appCache = {
        add: vi.fn().mockResolvedValue(undefined),
        match: vi.fn().mockResolvedValue(undefined),
    };
    const runtimeCache = { match: vi.fn().mockResolvedValue(undefined) };
    const caches = {
        open: vi.fn(async (name) => name.includes('runtime') ? runtimeCache : appCache),
        keys: vi.fn().mockResolvedValue(['duevinci-v8.37', 'duevinci-runtime-v1']),
        delete: vi.fn().mockResolvedValue(true),
    };
    const fetch = vi.fn().mockResolvedValue(new Response('network module'));
    runInNewContext(source, {
        self: {
            addEventListener: (name, handler) => handlers.set(name, handler),
            skipWaiting: vi.fn(),
            clients: { claim: vi.fn() },
        },
        caches, fetch, URL,
        Request: class extends Request {
            constructor(input, init) { super(new URL(input, 'https://duevinci.tech/sw.js'), init); }
        },
    });
    return { handlers, appCache, runtimeCache, caches, fetch };
}

async function finishLifecycle(handler) {
    let pending;
    handler({ waitUntil: (promise) => { pending = promise; } });
    await pending;
}

describe('Service worker release updates', () => {
    it('loads the application shell without reusing stale HTTP cache entries', async () => {
        const worker = createWorker();
        await finishLifecycle(worker.handlers.get('install'));

        expect(worker.appCache.add).toHaveBeenCalled();
        expect(worker.appCache.add.mock.calls.every(([request]) => request.cache === 'reload')).toBe(true);
    });

    it('removes the previous release shell and its persistent runtime scripts', async () => {
        const worker = createWorker();
        await finishLifecycle(worker.handlers.get('activate'));

        expect(worker.caches.delete).toHaveBeenCalledWith('duevinci-v8.37');
        expect(worker.caches.delete).toHaveBeenCalledWith('duevinci-runtime-v1');
    });

    it('serves a versioned app module from the current shell before an older runtime copy', async () => {
        const worker = createWorker();
        worker.appCache.match.mockImplementation(async (_request, options) =>
            options?.ignoreSearch ? new Response('current shell module') : undefined);
        worker.runtimeCache.match.mockResolvedValue(new Response('old runtime module'));
        let response;
        worker.handlers.get('fetch')({
            request: { url: 'https://duevinci.tech/js/app.js?v=2.8.1', method: 'GET', mode: 'cors' },
            respondWith: (promise) => { response = promise; },
        });

        expect(await (await response).text()).toBe('current shell module');
        expect(worker.runtimeCache.match).not.toHaveBeenCalled();
    });
});
