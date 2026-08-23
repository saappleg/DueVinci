// --- INDEXEDDB OFFLINE-FIRST STORAGE & SUPABASE SYNC LAYER ---

const DB_NAME = 'duevinci_offline_cache';
const DB_VERSION = 2;
const DATA_STORES = ['courses', 'assignments', 'custom_events'];
const ALL_STORES = [...DATA_STORES, 'pending_mutations'];
const OFFLINE_TABLES = new Set(DATA_STORES);
let dbInstance = null;

function isOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function cacheKey(userId, id) { return `${userId}:${id}`; }
function fallbackCacheKey(storeName, userId) { return `duevinci_offline:${storeName}:${userId}`; }
function writeFallbackCache(storeName, items, userId) {
    try { localStorage.setItem(fallbackCacheKey(storeName, userId), JSON.stringify(items)); } catch { /* IndexedDB remains the primary cache. */ }
}
function readFallbackCache(storeName, userId) {
    try {
        const items = JSON.parse(localStorage.getItem(fallbackCacheKey(storeName, userId)) || '[]');
        return Array.isArray(items) ? items : [];
    } catch { return []; }
}
function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function isConnectivityFailure(error) {
    return !isOnline() || /network|fetch|offline|load failed/i.test(error?.message || String(error || ''));
}

export function getOfflineDb() {
    return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        if (dbInstance) return resolve(dbInstance);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            // Version 1 used global IDs. Recreate the small local caches so
            // records are isolated by signed-in user ID.
            ALL_STORES.forEach((name) => {
                if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
                db.createObjectStore(name, { keyPath: 'cache_key' });
            });
        };
        request.onsuccess = () => { dbInstance = request.result; resolve(dbInstance); };
        request.onerror = () => { console.warn('IndexedDB open error:', request.error); resolve(null); };
    });
}

function runTransaction(storeName, mode, operation) {
    return getOfflineDb().then((db) => new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
            const tx = db.transaction(storeName, mode);
            operation(tx.objectStore(storeName), resolve);
            tx.onerror = () => resolve(null);
        } catch { resolve(null); }
    }));
}

export async function cacheDataLocally(storeName, items = [], userId) {
    if (!DATA_STORES.includes(storeName) || !userId || !Array.isArray(items)) return false;
    // Keep a compact per-user fallback. It makes the planner usable in
    // browsers where IndexedDB is disabled and gives the PWA a second durable
    // cache layer for its essential academic records.
    writeFallbackCache(storeName, items, userId);
    const saved = await runTransaction(storeName, 'readwrite', (store, resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
            (request.result || []).filter((item) => item.user_id === userId).forEach((item) => store.delete(item.cache_key));
            items.filter((item) => item?.id).forEach((item) => store.put({ ...item, user_id: item.user_id || userId, cache_key: cacheKey(userId, item.id) }));
        };
        request.onerror = () => resolve(false);
        store.transaction.oncomplete = () => resolve(true);
    });
    return saved !== null;
}

export async function getLocalCachedData(storeName, userId) {
    if (!DATA_STORES.includes(storeName) || !userId) return [];
    const records = await runTransaction(storeName, 'readonly', (store, resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result || []).filter((item) => item.user_id === userId).map(({ cache_key, ...item }) => item));
        request.onerror = () => resolve([]);
    });
    return records?.length ? records : readFallbackCache(storeName, userId);
}

async function applyLocalMutation(action, table, payload, filters, userId) {
    if (!OFFLINE_TABLES.has(table) || !userId) return null;
    const records = await getLocalCachedData(table, userId);
    const id = filters.find((filter) => filter.column === 'id')?.value;
    const targetUserId = filters.find((filter) => filter.column === 'user_id')?.value;
    const matches = (item) => (!id || item.id === id) && (!targetUserId || item.user_id === targetUserId);
    let next = records;
    let result = [];

    if (action === 'insert' || action === 'upsert') {
        const incoming = (Array.isArray(payload) ? payload : [payload]).map((item) => ({ ...item, id: item.id || makeId(), user_id: item.user_id || userId }));
        const byId = new Map(records.map((item) => [item.id, item]));
        incoming.forEach((item) => byId.set(item.id, action === 'upsert' ? { ...(byId.get(item.id) || {}), ...item } : item));
        next = [...byId.values()];
        result = incoming;
    } else if (action === 'update') {
        next = records.map((item) => matches(item) ? { ...item, ...payload } : item);
        result = next.filter(matches);
    } else if (action === 'delete') {
        result = records.filter(matches);
        next = records.filter((item) => !matches(item));
    }
    await cacheDataLocally(table, next, userId);
    return result;
}

export async function queueOfflineMutation(action, table, payload, filters = [], userId) {
    if (!OFFLINE_TABLES.has(table) || !userId) return false;
    return runTransaction('pending_mutations', 'readwrite', (store, resolve) => {
        store.put({ cache_key: `mut:${makeId()}`, action, table, payload, filters, user_id: userId, timestamp: Date.now() });
        store.transaction.oncomplete = () => resolve(true);
    });
}

async function getPendingMutations(userId) {
    return runTransaction('pending_mutations', 'readonly', (store, resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result || []).filter((item) => item.user_id === userId).sort((a, b) => a.timestamp - b.timestamp));
        request.onerror = () => resolve([]);
    }) || [];
}

async function removePendingMutation(key) {
    return runTransaction('pending_mutations', 'readwrite', (store, resolve) => {
        store.delete(key);
        store.transaction.oncomplete = () => resolve(true);
    });
}

function applyFilters(query, filters) {
    return filters.reduce((builder, filter) => builder.eq(filter.column, filter.value), query);
}

export async function processOfflineQueue(client, userId) {
    if (!client || !userId || !isOnline()) return { processed: 0, remaining: 0 };
    const pending = await getPendingMutations(userId);
    let processed = 0;
    for (const mutation of pending) {
        try {
            let query = client.from(mutation.table);
            if (mutation.action === 'insert') query = query.insert(mutation.payload);
            else if (mutation.action === 'upsert') query = query.upsert(mutation.payload);
            else if (mutation.action === 'update') query = applyFilters(query.update(mutation.payload), mutation.filters);
            else if (mutation.action === 'delete') query = applyFilters(query.delete(), mutation.filters);
            const { error } = await query;
            if (error) {
                if (!isConnectivityFailure(error)) console.warn('Offline change needs attention:', error.message || error);
                break; // Preserve unsynced work for a later retry.
            }
            await removePendingMutation(mutation.cache_key);
            processed += 1;
        } catch (error) {
            if (!isConnectivityFailure(error)) console.warn('Offline sync error:', error);
            break;
        }
    }
    return { processed, remaining: (await getPendingMutations(userId)).length };
}

function applyReadOptions(records, state) {
    let result = [...records];
    state.filters.forEach(({ column, value }) => { result = result.filter((item) => item[column] === value); });
    if (state.order) {
        const { column, options } = state.order;
        result.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (options?.ascending === false ? -1 : 1));
    }
    return state.single ? result[0] || null : result;
}

async function currentOfflineUser(client) {
    // getUser() verifies against Supabase over the network. The persisted
    // session is the correct identity source while the PWA is offline.
    try { return (await client.auth.getSession()).data?.session?.user || null; } catch { return null; }
}

async function resolveOfflineQuery(state, userId) {
    if (state.action === 'select') return { data: applyReadOptions(await getLocalCachedData(state.table, userId), state), error: null };
    const data = await applyLocalMutation(state.action, state.table, state.payload, state.filters, userId);
    await queueOfflineMutation(state.action, state.table, state.payload, state.filters, userId);
    return { data: state.single ? data?.[0] || null : data || [], error: null };
}

/**
 * Preserves the regular Supabase query API for the free planner tables.
 * Successful reads fill IndexedDB; offline/network-failed reads and writes use
 * the per-user cache and durable mutation queue instead.
 */
export function createOfflineFirstClient(client) {
    if (!client?.from || client.__dueVinciOfflineWrapped) return client;
    const wrapped = Object.create(client);
    wrapped.__dueVinciOfflineWrapped = true;
    wrapped.from = (table) => {
        const raw = client.from(table);
        if (!OFFLINE_TABLES.has(table)) return raw;
        const state = { table, action: 'select', payload: null, filters: [], order: null, single: false, raw };
        let proxy;
        const execute = async () => {
            const user = await currentOfflineUser(client);
            if (!user) return state.raw;
            if (!isOnline()) return resolveOfflineQuery(state, user.id);
            try {
                const response = await state.raw;
                if (response?.error && isConnectivityFailure(response.error)) return resolveOfflineQuery(state, user.id);
                if (!response?.error) {
                    if (state.action === 'select' && Array.isArray(response?.data)) await cacheDataLocally(table, response.data, user.id);
                    if (state.action !== 'select') await applyLocalMutation(state.action, table, state.payload, state.filters, user.id);
                }
                return response;
            } catch (error) {
                if (isConnectivityFailure(error)) return resolveOfflineQuery(state, user.id);
                throw error;
            }
        };
        proxy = new Proxy(raw, {
            get(target, property) {
                if (property === 'then') return (resolve, reject) => execute().then(resolve, reject);
                if (property === 'catch') return (reject) => execute().catch(reject);
                if (property === 'finally') return (callback) => execute().finally(callback);
                if (property === 'select') return (...args) => { state.raw = state.raw.select(...args); return proxy; };
                if (property === 'insert' || property === 'upsert' || property === 'update') return (payload, ...args) => {
                    state.action = property;
                    const values = (Array.isArray(payload) ? payload : [payload]).map((item) => property === 'update' ? item : { ...item, id: item.id || makeId() });
                    state.payload = Array.isArray(payload) ? values : values[0];
                    state.raw = target[property](state.payload, ...args);
                    return proxy;
                };
                if (property === 'delete') return (...args) => { state.action = 'delete'; state.raw = target.delete(...args); return proxy; };
                if (property === 'eq') return (column, value) => { state.filters.push({ column, value }); state.raw = state.raw.eq(column, value); return proxy; };
                if (property === 'order') return (column, options) => { state.order = { column, options }; state.raw = state.raw.order(column, options); return proxy; };
                if (property === 'single') return (...args) => { state.single = true; state.raw = state.raw.single(...args); return proxy; };
                const value = target[property];
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
        return proxy;
    };
    return wrapped;
}

export function initNetworkStatusListeners(client) {
    if (typeof window === 'undefined') return;
    const showStatus = (online, summary = null) => {
        let badge = document.getElementById('offlineStatusBadge');
        if (!online) {
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'offlineStatusBadge';
                badge.className = 'fixed top-4 right-4 z-[9999] bg-amber-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5';
                document.body.appendChild(badge);
            }
            badge.textContent = 'Offline — changes will sync when reconnected';
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.textContent = summary?.remaining ? 'Online — some changes still need syncing' : 'Online — offline changes synced';
            badge.classList.remove('hidden');
            setTimeout(() => badge.classList.add('hidden'), 3500);
        }
    };
    window.addEventListener('offline', () => showStatus(false));
    window.addEventListener('online', async () => {
        const user = await currentOfflineUser(client);
        showStatus(true, user ? await processOfflineQueue(client, user.id) : null);
    });
    if (!isOnline()) showStatus(false);
    else {
        // A queued write can survive an app close. Replay it on the next
        // authenticated launch even if the browser's online event occurred
        // before this page was opened.
        currentOfflineUser(client).then((user) => user && processOfflineQueue(client, user.id));
    }
}

const scope = typeof window !== 'undefined' ? window : globalThis;
Object.assign(scope, { getOfflineDb, cacheDataLocally, getLocalCachedData, queueOfflineMutation, processOfflineQueue, createOfflineFirstClient, initNetworkStatusListeners });
