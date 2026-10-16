// --- INDEXEDDB OFFLINE-FIRST STORAGE & SUPABASE SYNC LAYER ---

const DB_NAME = 'duevinci_offline_cache';
const DB_VERSION = 3;
const DATA_STORES = ['courses', 'assignments', 'custom_events'];
const ALL_STORES = [...DATA_STORES, 'pending_mutations'];
const OFFLINE_TABLES = new Set(DATA_STORES);
let dbInstance = null;
let cacheRevisionSequence = 0;
const tableOperationQueues = new Map();

function isOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function cacheKey(userId, id) { return `${userId}:${id}`; }
function fallbackCacheKey(storeName, userId) { return `duevinci_offline:${storeName}:${userId}`; }
function fallbackPendingKey(userId) { return `duevinci_offline:pending_mutations:${userId}`; }
function fallbackPendingMutationPrefix(userId) { return `duevinci_offline:pending_mutation:${userId}:`; }
function fallbackPendingMutationKey(userId, mutationKey) { return `${fallbackPendingMutationPrefix(userId)}${encodeURIComponent(mutationKey)}`; }
function fallbackTombstoneKey(storeName, userId) { return `duevinci_offline:tombstones:${storeName}:${userId}`; }
function cacheMutationSignalKey(storeName, userId) { return `duevinci_offline:mutation_signal:${storeName}:${userId}`; }
function cacheLockName(storeName, userId) { return `duevinci-offline-cache:${userId}:${storeName}`; }
function supportsCrossTabLocks() {
    return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
}
function withCrossTabTableLock(storeName, userId, operation) {
    if (!supportsCrossTabLocks()) return operation();
    return navigator.locks.request(cacheLockName(storeName, userId), operation);
}
function readCacheMutationSignal(storeName, userId) {
    try { return localStorage.getItem(cacheMutationSignalKey(storeName, userId)) || ''; } catch { return ''; }
}
function signalCacheMutation(storeName, userId) {
    try { localStorage.setItem(cacheMutationSignalKey(storeName, userId), `${Date.now()}-${makeId()}`); } catch { /* In-tab table queues still protect supported browsers. */ }
}
function writeFallbackCache(storeName, items, userId, { replace = false, shouldWrite = null } = {}) {
    try {
        const records = replace ? items : mergeCachedRecords(readFallbackCache(storeName, userId), items, userId);
        if (typeof shouldWrite === 'function' && !shouldWrite()) return false;
        localStorage.setItem(fallbackCacheKey(storeName, userId), JSON.stringify(records));
        return true;
    } catch { return false; }
}
function readFallbackCache(storeName, userId) {
    try {
        const items = JSON.parse(localStorage.getItem(fallbackCacheKey(storeName, userId)) || '[]');
        return Array.isArray(items) ? items : [];
    } catch { return []; }
}
function readFallbackPendingMutations(userId) {
    const pending = [];
    try {
        const legacy = JSON.parse(localStorage.getItem(fallbackPendingKey(userId)) || '[]');
        if (Array.isArray(legacy)) pending.push(...legacy.filter((item) => item?.user_id === userId));
    } catch { /* Use any records retained in IndexedDB. */ }

    const prefix = fallbackPendingMutationPrefix(userId);
    const seenKeys = new Set();
    let priorPassStable = false;
    // Key indices can shift if another tab removes a completed mutation while
    // we scan. Take a per-pass snapshot and rescan if the storage shape moved.
    for (let attempt = 0; attempt < 3; attempt++) {
        let before = 0;
        let after = 0;
        const keys = [];
        try {
            before = localStorage.length;
            for (let index = 0; index < before; index++) {
                const key = localStorage.key(index);
                if (key?.startsWith(prefix) && !seenKeys.has(key)) keys.push(key);
            }
            after = localStorage.length;
        } catch { break; }
        keys.forEach((key) => {
            seenKeys.add(key);
            try {
                const mutation = JSON.parse(localStorage.getItem(key) || 'null');
                if (mutation?.user_id === userId && mutation.cache_key) pending.push(mutation);
            } catch { /* Ignore a damaged entry while retaining other pending work. */ }
        });
        const stablePass = before === after;
        if (stablePass && keys.length === 0 && priorPassStable) break;
        priorPassStable = stablePass;
    }
    return pending;
}
export function mergeCachedRecords(existing = [], incoming = [], userId) {
    const byId = new Map((Array.isArray(existing) ? existing : []).filter((item) => item?.id).map((item) => [item.id, item]));
    (Array.isArray(incoming) ? incoming : []).filter((item) => item?.id).forEach((item) => {
        const prior = byId.get(item.id) || {};
        const incomingRevision = Number(item._cache_revision) || 0;
        const priorRevision = Number(prior._cache_revision) || 0;
        const preferred = incomingRevision >= priorRevision ? item : prior;
        const secondary = preferred === item ? prior : item;
        const merged = { ...secondary, ...preferred, user_id: preferred.user_id || secondary.user_id || userId };
        if (preferred._cache_tombstone) merged._cache_tombstone = true;
        else delete merged._cache_tombstone;
        byId.set(item.id, merged);
    });
    return [...byId.values()];
}
export function filterCachedRecordsByTombstones(records = [], tombstones = {}) {
    return (Array.isArray(records) ? records : []).filter((item) => {
        const deletedAt = Number(tombstones[item?.id]) || 0;
        return !item?._cache_tombstone && (!deletedAt || (Number(item?._cache_revision) || 0) > deletedAt);
    });
}
export function shouldReplaceCachedTable({ selectedColumns = '*', filters = [], single = false, exactCount = null, dataLength = 0 } = {}) {
    return selectedColumns === '*' && filters.length === 0 && !single && Number.isInteger(exactCount) && exactCount === dataLength;
}
function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function readCacheTombstones(storeName, userId) {
    try {
        const parsed = JSON.parse(localStorage.getItem(fallbackTombstoneKey(storeName, userId)) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
}
function writeCacheTombstones(storeName, userId, tombstones) {
    try {
        const key = fallbackTombstoneKey(storeName, userId);
        if (Object.keys(tombstones).length) localStorage.setItem(key, JSON.stringify(tombstones));
        else localStorage.removeItem(key);
        return true;
    } catch { return false; }
}
function nextCacheRevision(existing = []) {
    const greatestExisting = (Array.isArray(existing) ? existing : []).reduce((greatest, item) => Math.max(greatest, Number(item?._cache_revision) || 0), 0);
    cacheRevisionSequence = Math.max(Date.now() * 1000 + (++cacheRevisionSequence % 1000), cacheRevisionSequence + 1, greatestExisting + 1);
    return cacheRevisionSequence;
}
function isConnectivityFailure(error) {
    return !isOnline() || /network|fetch|offline|load failed/i.test(error?.message || String(error || ''));
}

function serializeTableOperation(userId, table, operation) {
    const key = `${userId}:${table}`;
    const previous = tableOperationQueues.get(key) || Promise.resolve();
    const current = previous.then(operation, operation);
    const settled = current.then(() => undefined, () => undefined);
    tableOperationQueues.set(key, settled);
    settled.then(() => {
        if (tableOperationQueues.get(key) === settled) tableOperationQueues.delete(key);
    });
    return current;
}

export function getOfflineDb() {
    return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        if (dbInstance) return resolve(dbInstance);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = request.result;
            const oldVersion = event.oldVersion;
            let legacyUserId = '';
            try { legacyUserId = JSON.parse(localStorage.getItem('duevinci_offline_user') || 'null')?.id || ''; } catch { /* No local identity available. */ }
            ALL_STORES.forEach((name) => {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name, { keyPath: 'cache_key' });
                    return;
                }
                // Version 2 already uses per-account cache keys. Keep its
                // records; version 1 stores are rebuilt below after copying
                // their rows into the new key format.
                if (oldVersion >= 2) return;

                const oldStore = request.transaction.objectStore(name);
                const read = oldStore.getAll();
                read.onsuccess = () => {
                    const legacyRecords = Array.isArray(read.result) ? read.result : [];
                    db.deleteObjectStore(name);
                    const newStore = db.createObjectStore(name, { keyPath: 'cache_key' });
                    const unassigned = [];
                    legacyRecords.forEach((item, index) => {
                        const userId = typeof item?.user_id === 'string' && item.user_id ? item.user_id : legacyUserId;
                        if (!userId) {
                            unassigned.push(item);
                            return;
                        }
                        const id = item?.id || `migrated-${index}`;
                        const cache_key = name === 'pending_mutations'
                            ? item?.cache_key || `mut:migrated-${userId}-${id}`
                            : cacheKey(userId, id);
                        newStore.put({ ...item, user_id: userId, cache_key });
                    });
                    if (unassigned.length) {
                        try { localStorage.setItem(`duevinci_offline:legacy_unassigned:${name}`, JSON.stringify(unassigned)); }
                        catch { try { request.transaction.abort(); } catch { /* Keep the original cache if migration cannot preserve these rows. */ } }
                    }
                };
                read.onerror = () => { try { request.transaction.abort(); } catch { /* Already closed. */ } };
            });
        };
        request.onsuccess = () => { dbInstance = request.result; resolve(dbInstance); };
        request.onerror = () => { console.warn('IndexedDB open error:', request.error); resolve(null); };
    });
}

export async function clearOfflineUserData(userId) {
    if (!userId) return true;
    const fallbackKeys = [
        ...DATA_STORES.map((storeName) => fallbackCacheKey(storeName, userId)),
        ...DATA_STORES.map((storeName) => fallbackTombstoneKey(storeName, userId)),
        ...DATA_STORES.map((storeName) => cacheMutationSignalKey(storeName, userId)),
        fallbackPendingKey(userId),
    ];
    try { fallbackKeys.forEach((key) => localStorage.removeItem(key)); } catch { /* Continue clearing IndexedDB. */ }
    try {
        const cleanupPrefixes = [
            `duevinci_flashcards_mastery_${userId}_`,
            `duevinci_flashcards_mastery_pending_${userId}_`,
            fallbackPendingMutationPrefix(userId),
        ];
        for (let index = localStorage.length - 1; index >= 0; index--) {
            const key = localStorage.key(index);
            if (key && cleanupPrefixes.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key);
        }
    } catch { /* Continue clearing IndexedDB. */ }

    let db;
    try { db = await getOfflineDb(); } catch { return false; }
    if (!db) return typeof indexedDB === 'undefined';

    return new Promise((resolve) => {
        let transaction;
        try {
            transaction = db.transaction(ALL_STORES, 'readwrite');
            ALL_STORES.forEach((storeName) => {
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => {
                    (request.result || []).filter((item) => item.user_id === userId)
                        .forEach((item) => store.delete(item.cache_key));
                };
                request.onerror = () => { try { transaction.abort(); } catch { /* Already closed. */ } };
            });
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = transaction.onabort = () => resolve(false);
        } catch {
            resolve(false);
        }
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

export async function cacheDataLocally(storeName, items = [], userId, options = {}) {
    const { replace = false, shouldWrite = null, crossTabLockHeld = false } = options;
    if (!DATA_STORES.includes(storeName) || !userId || !Array.isArray(items)) return false;
    // Without a cross-tab lock there is no atomic compare-and-swap for the
    // localStorage fallback. Keep local/offline mutations, but do not let a
    // network snapshot replace the cache on that browser.
    if (typeof shouldWrite === 'function' && !supportsCrossTabLocks()) return false;
    if (!crossTabLockHeld && supportsCrossTabLocks()) {
        return withCrossTabTableLock(storeName, userId, () => cacheDataLocally(storeName, items, userId, { ...options, crossTabLockHeld: true }));
    }
    // Keep a compact per-user fallback. It makes the planner usable in
    // browsers where IndexedDB is disabled and gives the PWA a second durable
    // cache layer for its essential academic records.
    const existingLayers = await getLocalCachedRecordsWithMetadata(storeName, userId);
    // Check after the asynchronous cache read and immediately before the
    // synchronous fallback write. Cross-tab table mutations publish their
    // signal before changing the cache, so an older fetch must stop here.
    if (typeof shouldWrite === 'function' && !shouldWrite()) return false;
    const revision = nextCacheRevision(existingLayers);
    const recordsToSave = items.filter((item) => item?.id).map((item) => ({ ...item, _cache_revision: revision, user_id: item.user_id || userId }));
    const tombstones = readCacheTombstones(storeName, userId);
    const incomingIds = new Set(recordsToSave.map((item) => item.id));
    const deletedRecords = [];
    if (replace) {
        existingLayers.filter((item) => item?.id && !incomingIds.has(item.id)).forEach((item) => {
            tombstones[item.id] = revision;
            deletedRecords.push({ id: item.id, user_id: userId, _cache_revision: revision, _cache_tombstone: true });
        });
    }
    recordsToSave.forEach((item) => { delete tombstones[item.id]; });
    const fallbackRecords = replace ? [...recordsToSave, ...deletedRecords] : recordsToSave;
    const fallbackSaved = writeFallbackCache(storeName, fallbackRecords, userId, { replace, shouldWrite });
    if (typeof shouldWrite === 'function' && !shouldWrite()) return false;
    const tombstonesSaved = writeCacheTombstones(storeName, userId, tombstones);
    const saved = await runTransaction(storeName, 'readwrite', (store, resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
            // IndexedDB can finish opening after another tab has changed the
            // table. Abort this stale snapshot before it replaces those rows.
            if (typeof shouldWrite === 'function' && !shouldWrite()) {
                try { store.transaction.abort(); } catch { /* The transaction already completed. */ }
                resolve(false);
                return;
            }
            const existing = (request.result || []).filter((item) => item.user_id === userId);
            if (replace) existing.forEach((item) => store.delete(item.cache_key));
            const records = replace ? recordsToSave : mergeCachedRecords(existing, recordsToSave, userId);
            records.filter((item) => item?.id).forEach((item) => store.put({ ...item, user_id: item.user_id || userId, cache_key: cacheKey(userId, item.id) }));
        };
        request.onerror = () => resolve(false);
        store.transaction.oncomplete = () => resolve(true);
    });
    return fallbackSaved || saved === true || (tombstonesSaved && recordsToSave.length === 0);
}

async function getLocalCachedRecordsWithMetadata(storeName, userId) {
    const records = await runTransaction(storeName, 'readonly', (store, resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result || []).filter((item) => item.user_id === userId).map(({ cache_key, ...item }) => item));
        request.onerror = () => resolve([]);
    });
    // IndexedDB and localStorage can diverge if one write fails. Merge both
    // layers so a partial IndexedDB cache cannot hide fallback-only records.
    return mergeCachedRecords(readFallbackCache(storeName, userId), records || [], userId);
}

export async function getLocalCachedData(storeName, userId) {
    if (!DATA_STORES.includes(storeName) || !userId) return [];
    const tombstones = readCacheTombstones(storeName, userId);
    const records = await getLocalCachedRecordsWithMetadata(storeName, userId);
    return filterCachedRecordsByTombstones(records, tombstones).map(({ _cache_revision, ...item }) => item);
}

async function applyLocalMutation(action, table, payload, filters, userId, { crossTabLockHeld = false } = {}) {
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
    const saved = await cacheDataLocally(table, next, userId, { replace: true, crossTabLockHeld });
    return saved ? result : null;
}

export async function queueOfflineMutation(action, table, payload, filters = [], userId, { crossTabLockHeld = false } = {}) {
    if (!OFFLINE_TABLES.has(table) || !userId) return false;
    if (!crossTabLockHeld && supportsCrossTabLocks()) {
        return withCrossTabTableLock(table, userId, () => queueOfflineMutation(action, table, payload, filters, userId, { crossTabLockHeld: true }));
    }
    const mutation = { cache_key: `mut:${makeId()}`, action, table, payload, filters, user_id: userId, timestamp: Date.now() };
    let fallbackSaved = false;
    try {
        // Store each queued mutation under its own key. Concurrent tabs can
        // then append independently without racing on a shared JSON array.
        localStorage.setItem(fallbackPendingMutationKey(userId, mutation.cache_key), JSON.stringify(mutation));
        fallbackSaved = true;
    } catch { /* IndexedDB may still accept the queued write. */ }
    const indexedDbSaved = await runTransaction('pending_mutations', 'readwrite', (store, resolve) => {
        store.put(mutation);
        store.transaction.oncomplete = () => resolve(true);
    });
    return fallbackSaved || indexedDbSaved === true;
}

async function getPendingMutations(userId) {
    const indexed = await runTransaction('pending_mutations', 'readonly', (store, resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result || []).filter((item) => item.user_id === userId).sort((a, b) => a.timestamp - b.timestamp));
        request.onerror = () => resolve([]);
    }) || [];
    const fallback = readFallbackPendingMutations(userId);
    const byKey = new Map();
    [...fallback, ...indexed].forEach((item) => { if (item?.cache_key) byKey.set(item.cache_key, item); });
    return [...byKey.values()].sort((a, b) => a.timestamp - b.timestamp);
}

async function removePendingMutation(mutation) {
    let fallbackSaved = false;
    try {
        localStorage.removeItem(fallbackPendingMutationKey(mutation.user_id, mutation.cache_key));
        const key = fallbackPendingKey(mutation.user_id);
        try {
            const pending = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(pending)) {
                const remaining = pending.filter((item) => item?.cache_key !== mutation.cache_key);
                if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
                else localStorage.removeItem(key);
            }
        } catch { /* Ignore malformed legacy queues after removing the new entry. */ }
        fallbackSaved = true;
    } catch { /* Continue removing from IndexedDB. */ }
    const indexedDbSaved = await runTransaction('pending_mutations', 'readwrite', (store, resolve) => {
        store.delete(mutation.cache_key);
        store.transaction.oncomplete = () => resolve(true);
    });
    return fallbackSaved || indexedDbSaved === true;
}

function applyFilters(query, filters) {
    return filters.reduce((builder, filter) => builder.eq(filter.column, filter.value), query);
}

function recordMatchesFilters(record, filters = []) {
    return filters.every(({ column, value }) => record?.[column] === value);
}

export function applyPendingMutationsToRecords(records = [], pending = [], table, queryFilters = []) {
    const byId = new Map((Array.isArray(records) ? records : []).filter((item) => item?.id).map((item) => [item.id, { ...item }]));
    [...(Array.isArray(pending) ? pending : [])]
        .filter((mutation) => mutation?.table === table)
        .sort((a, b) => a.timestamp - b.timestamp)
        .forEach((mutation) => {
            const mutationMatches = (item) => recordMatchesFilters(item, mutation.filters || []);
            if (mutation.action === 'update') {
                byId.forEach((item, id) => {
                    if (mutationMatches(item)) byId.set(id, { ...item, ...mutation.payload });
                });
            } else if (mutation.action === 'delete') {
                byId.forEach((item, id) => { if (mutationMatches(item)) byId.delete(id); });
            } else if (mutation.action === 'insert' || mutation.action === 'upsert') {
                const incoming = Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload];
                incoming.filter((item) => item?.id).forEach((item) => {
                    byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
                });
            }
        });
    return [...byId.values()].filter((item) => recordMatchesFilters(item, queryFilters));
}

export async function processOfflineQueue(client, userId) {
    if (!client || !userId || !isOnline()) return { processed: 0, remaining: 0 };
    // Network replay bypasses the offline wrapper so this serialized replay
    // does not recursively wait behind its own table operation.
    const replayClient = client.__dueVinciRawClient || client;
    const pending = await getPendingMutations(userId);
    let processed = 0;
    for (const mutation of pending) {
        const completed = await serializeTableOperation(userId, mutation.table, async () => {
            // Another online listener may have replayed the same mutation
            // while this worker waited for the table's read/write queue.
            const currentPending = await getPendingMutations(userId);
            if (!currentPending.some((item) => item.cache_key === mutation.cache_key)) return true;
            if (!isOnline()) return false;
            try {
                let query = replayClient.from(mutation.table);
                // IDs are assigned before queueing, so replaying inserts as an
                // upsert makes a successful-but-unacknowledged retry idempotent.
                if (mutation.action === 'insert') query = query.upsert(mutation.payload);
                else if (mutation.action === 'upsert') query = query.upsert(mutation.payload);
                else if (mutation.action === 'update') query = applyFilters(query.update(mutation.payload), mutation.filters);
                else if (mutation.action === 'delete') query = applyFilters(query.delete(), mutation.filters);
                const { error } = await query;
                if (error) {
                    if (!isConnectivityFailure(error)) console.warn('Offline change needs attention:', error.message || error);
                    return false; // Preserve unsynced work for a later retry.
                }
                // Keep the cross-tab cache update and queue removal together.
                // A stale read must either finish first or observe this signal
                // and skip its cache write.
                return await withCrossTabTableLock(mutation.table, userId, async () => {
                    signalCacheMutation(mutation.table, userId);
                    await applyLocalMutation(mutation.action, mutation.table, mutation.payload, mutation.filters, userId, { crossTabLockHeld: true });
                    signalCacheMutation(mutation.table, userId);
                    await removePendingMutation(mutation);
                    return true;
                });
            } catch (error) {
                if (!isConnectivityFailure(error)) console.warn('Offline sync error:', error);
                return false;
            }
        });
        if (!completed) break;
        processed += 1;
    }
    if (processed && typeof window !== 'undefined') {
        try { window.dispatchEvent(new Event('duevinci:data-synced')); } catch { /* UI refresh is best-effort. */ }
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
    try {
        const sessionUser = (await client.auth.getSession()).data?.session?.user;
        if (sessionUser) return sessionUser;
    } catch { /* Fall back to the last authenticated local identity. */ }
    try { return JSON.parse(localStorage.getItem('duevinci_offline_user') || 'null'); } catch { return null; }
}

async function readCachedQuery(state, userId) {
    const cached = await getLocalCachedData(state.table, userId);
    const pending = await getPendingMutations(userId);
    const visible = applyPendingMutationsToRecords(cached, pending, state.table, state.filters);
    return applyReadOptions(visible, state);
}

async function resolveOfflineQuery(state, userId) {
    if (state.action === 'select') return { data: await readCachedQuery(state, userId), error: null };
    return withCrossTabTableLock(state.table, userId, async () => {
        const queued = await queueOfflineMutation(state.action, state.table, state.payload, state.filters, userId, { crossTabLockHeld: true });
        if (!queued) {
            return { data: null, error: new Error('This offline change could not be saved for syncing. Reconnect and try again.') };
        }
        signalCacheMutation(state.table, userId);
        const data = await applyLocalMutation(state.action, state.table, state.payload, state.filters, userId, { crossTabLockHeld: true });
        if (data === null) return { data: null, error: new Error('This offline change is queued, but could not be applied to the device cache.') };
        signalCacheMutation(state.table, userId);
        if (typeof window !== 'undefined') {
            try { window.dispatchEvent(new Event('duevinci:data-synced')); } catch { /* UI refresh is best-effort. */ }
        }
        return { data: state.single ? data?.[0] || null : data || [], error: null };
    });
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
    wrapped.__dueVinciRawClient = client;
    wrapped.from = (table) => {
        const raw = client.from(table);
        if (!OFFLINE_TABLES.has(table)) return raw;
        const state = { table, action: 'select', payload: null, filters: [], order: null, single: false, selectedColumns: '*', countExactRequested: false, raw };
        let proxy;
        const execute = async () => {
            const user = await currentOfflineUser(client);
            if (!user) return state.raw;
            return serializeTableOperation(user.id, table, async () => {
                if (!isOnline()) return resolveOfflineQuery(state, user.id);
                const readSignal = state.action === 'select' ? readCacheMutationSignal(table, user.id) : null;
                const pendingBeforeRead = state.action === 'select' ? await getPendingMutations(user.id) : [];
                try {
                    const response = await state.raw;
                    if (response?.error && isConnectivityFailure(response.error)) return resolveOfflineQuery(state, user.id);
                    if (!response?.error) {
                        if (state.action === 'select' && Array.isArray(response?.data)) {
                            const mutationSignalChanged = readSignal !== readCacheMutationSignal(table, user.id);
                            const completeTableRead = state.countExactRequested && shouldReplaceCachedTable({
                                selectedColumns: state.selectedColumns,
                                filters: state.filters,
                                single: state.single,
                                exactCount: response.count,
                                dataLength: response.data.length,
                            });
                            const pendingAfterRead = await getPendingMutations(user.id);
                            const pendingByKey = new Map([...pendingBeforeRead, ...pendingAfterRead].map((mutation) => [mutation.cache_key, mutation]));
                            const pendingForTable = [...pendingByKey.values()].filter((mutation) => mutation.table === table);
                            if (state.selectedColumns === '*') {
                                if (mutationSignalChanged) {
                                    // A cross-tab write finished while this
                                    // request was in flight. Give the current
                                    // renderer the current cache as well as
                                    // protecting it from the stale response.
                                    response.data = await readCachedQuery(state, user.id);
                                } else {
                                    response.data = applyReadOptions(
                                        applyPendingMutationsToRecords(response.data, pendingForTable, table, state.filters),
                                        state,
                                    );
                                }
                            }
                            // A different tab may have completed a local or
                            // queued write while this request was in flight.
                            // Its localStorage signal is shared across tabs;
                            // never let the older response replace that cache.
                            if (!mutationSignalChanged &&
                                !state.single && (state.selectedColumns === '*' || pendingForTable.length === 0)) {
                                await cacheDataLocally(table, response.data, user.id, {
                                    replace: completeTableRead,
                                    shouldWrite: () => readSignal === readCacheMutationSignal(table, user.id),
                                });
                                if (state.selectedColumns === '*' && readSignal !== readCacheMutationSignal(table, user.id)) {
                                    // A second tab can signal a write while
                                    // cacheDataLocally is loading metadata.
                                    response.data = await readCachedQuery(state, user.id);
                                }
                            }
                        }
                        if (state.action !== 'select') {
                            await withCrossTabTableLock(table, user.id, async () => {
                                signalCacheMutation(table, user.id);
                                await applyLocalMutation(state.action, table, state.payload, state.filters, user.id, { crossTabLockHeld: true });
                                signalCacheMutation(table, user.id);
                                if (typeof window !== 'undefined') {
                                    try { window.dispatchEvent(new Event('duevinci:data-synced')); } catch { /* UI refresh is best-effort. */ }
                                }
                            });
                        }
                    }
                    return response;
                } catch (error) {
                    if (isConnectivityFailure(error)) return resolveOfflineQuery(state, user.id);
                    throw error;
                }
            });
        };
        proxy = new Proxy(raw, {
            get(target, property) {
                if (property === 'then') return (resolve, reject) => execute().then(resolve, reject);
                if (property === 'catch') return (reject) => execute().catch(reject);
                if (property === 'finally') return (callback) => execute().finally(callback);
                if (property === 'select') return (...args) => {
                    state.selectedColumns = typeof args[0] === 'string' ? args[0].trim() : '*';
                    const options = args[1] && typeof args[1] === 'object' ? args[1] : {};
                    state.countExactRequested = state.selectedColumns === '*' && !options.head;
                    const safeOptions = state.countExactRequested ? { ...options, count: 'exact' } : options;
                    state.raw = state.raw.select(args[0], safeOptions);
                    return proxy;
                };
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
                if (property === 'maybeSingle') return (...args) => { state.single = true; state.raw = state.raw.maybeSingle(...args); return proxy; };
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
        if (!user) { showStatus(true, null); return; }
        const summary = await processOfflineQueue(client, user.id);
        try {
            const mastery = await window.syncPendingFlashcardMastery?.();
            summary.remaining += mastery?.remaining || 0;
        } catch (error) {
            console.warn('Some study progress still needs syncing:', error?.message || error);
            summary.remaining += 1;
        }
        showStatus(true, summary);
    });
    if (!isOnline()) showStatus(false);
    else {
        // A queued write can survive an app close. Replay it on the next
        // authenticated launch even if the browser's online event occurred
        // before this page was opened.
        currentOfflineUser(client).then(async (user) => {
            if (!user) return;
            await processOfflineQueue(client, user.id);
            try { await window.syncPendingFlashcardMastery?.(); }
            catch (error) { console.warn('Flashcard mastery sync will retry later:', error?.message || error); }
        });
    }
}

const scope = typeof window !== 'undefined' ? window : globalThis;
Object.assign(scope, { getOfflineDb, cacheDataLocally, getLocalCachedData, queueOfflineMutation, processOfflineQueue, createOfflineFirstClient, initNetworkStatusListeners });

