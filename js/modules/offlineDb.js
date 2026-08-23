// --- INDEXEDDB OFFLINE-FIRST STORAGE & SYNC ENGINE ---

const DB_NAME = 'duevinci_offline_cache';
const DB_VERSION = 1;
const STORES = ['courses', 'assignments', 'custom_events', 'pending_mutations'];

let dbInstance = null;

/**
 * Initializes or returns the IndexedDB instance.
 */
export function getOfflineDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = request.result;
            STORES.forEach(store => {
                if (!db.objectStoreNames.contains(store)) {
                    db.createObjectStore(store, { keyPath: 'id' });
                }
            });
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onerror = () => {
            console.warn('IndexedDB open error:', request.error);
            resolve(null);
        };
    });
}

/**
 * Caches an array of items into IndexedDB store.
 */
export async function cacheDataLocally(storeName, items = []) {
    const db = await getOfflineDb();
    if (!db || !items || !Array.isArray(items)) return;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.clear();
            items.forEach(item => {
                if (item && item.id) {
                    store.put(item);
                }
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
}

/**
 * Retrieves all items from an IndexedDB store.
 */
export async function getLocalCachedData(storeName) {
    const db = await getOfflineDb();
    if (!db) return [];

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        } catch {
            resolve([]);
        }
    });
}

/**
 * Queues an offline mutation when network connectivity is lost.
 */
export async function queueOfflineMutation(action, table, payload) {
    const db = await getOfflineDb();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction('pending_mutations', 'readwrite');
            const store = tx.objectStore('pending_mutations');
            store.put({
                id: 'mut_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                action,
                table,
                payload,
                timestamp: Date.now()
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
}

/**
 * Monitors online/offline network lifecycle.
 */
export function initNetworkStatusListeners() {
    if (typeof window === 'undefined') return;

    const showStatus = (isOnline) => {
        let badge = document.getElementById('offlineStatusBadge');
        if (!isOnline) {
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'offlineStatusBadge';
                badge.className = 'fixed top-4 right-4 z-[9999] bg-amber-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5 animate-bounce';
                badge.innerHTML = `<span>⚡</span> Offline Mode — reconnect to save changes`;
                document.body.appendChild(badge);
            }
            badge.classList.remove('hidden');
        } else {
            if (badge) badge.classList.add('hidden');
        }
    };

    window.addEventListener('offline', () => showStatus(false));
    window.addEventListener('online', () => showStatus(true));
}

// Bind to window / global
const _offScope = typeof window !== 'undefined' ? window : globalThis;
_offScope.getOfflineDb = getOfflineDb;
_offScope.cacheDataLocally = cacheDataLocally;
_offScope.getLocalCachedData = getLocalCachedData;
_offScope.queueOfflineMutation = queueOfflineMutation;
_offScope.initNetworkStatusListeners = initNetworkStatusListeners;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initNetworkStatusListeners();
    });
}
