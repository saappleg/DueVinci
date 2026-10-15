import { describe, expect, it, vi } from 'vitest';
import { applyPendingMutationsToRecords, cacheDataLocally, clearOfflineUserData, createOfflineFirstClient, filterCachedRecordsByTombstones, getLocalCachedData, mergeCachedRecords, processOfflineQueue, queueOfflineMutation, shouldReplaceCachedTable } from '../js/modules/offlineDb.js';

describe('offline record cache', () => {
    it('merges filtered and projected reads without dropping other records or fields', () => {
        const existing = [
            { id: 'course-a', user_id: 'student-1', name: 'Biology', notes: 'Keep this note', pacing_type: 'weekly' },
            { id: 'course-b', user_id: 'student-1', name: 'Chemistry', notes: 'Other notes' },
        ];
        const filteredProjection = [{ id: 'course-a', name: 'Biology II' }];

        expect(mergeCachedRecords(existing, filteredProjection, 'student-1')).toEqual([
            { id: 'course-a', user_id: 'student-1', name: 'Biology II', notes: 'Keep this note', pacing_type: 'weekly' },
            { id: 'course-b', user_id: 'student-1', name: 'Chemistry', notes: 'Other notes' },
        ]);
    });

    it('adds returned assignments while retaining cached assignments from other courses', () => {
        const existing = [{ id: 'assignment-a', course_id: 'course-a', name: 'Essay' }];
        const filtered = [{ id: 'assignment-b', course_id: 'course-b', name: 'Lab' }];

        expect(mergeCachedRecords(existing, filtered, 'student-1')).toEqual([
            { id: 'assignment-a', course_id: 'course-a', name: 'Essay', user_id: 'student-1' },
            { id: 'assignment-b', course_id: 'course-b', name: 'Lab', user_id: 'student-1' },
        ]);
    });

    it('only replaces a table snapshot when an exact full result is confirmed', () => {
        expect(shouldReplaceCachedTable({ selectedColumns: '*', exactCount: 2, dataLength: 2 })).toBe(true);
        expect(shouldReplaceCachedTable({ selectedColumns: '*', exactCount: 3, dataLength: 2 })).toBe(false);
        expect(shouldReplaceCachedTable({ selectedColumns: '*', exactCount: null, dataLength: 2 })).toBe(false);
        expect(shouldReplaceCachedTable({ selectedColumns: '*', filters: [{ column: 'id', value: 'a' }], exactCount: 1, dataLength: 1 })).toBe(false);
        expect(shouldReplaceCachedTable({ selectedColumns: 'id, name', exactCount: 2, dataLength: 2 })).toBe(false);
    });

    it('overlays queued completion, deletion, and insertion operations on a server read', () => {
        const rows = [
            { id: 'assignment-a', is_completed: false },
            { id: 'assignment-b', is_completed: false },
        ];
        const pending = [
            { cache_key: '1', table: 'assignments', action: 'update', payload: { is_completed: true }, filters: [{ column: 'id', value: 'assignment-a' }], timestamp: 1 },
            { cache_key: '2', table: 'assignments', action: 'delete', filters: [{ column: 'id', value: 'assignment-b' }], timestamp: 2 },
            { cache_key: '3', table: 'assignments', action: 'insert', payload: { id: 'assignment-c', is_completed: false }, timestamp: 3 },
        ];

        expect(applyPendingMutationsToRecords(rows, pending, 'assignments')).toEqual([
            { id: 'assignment-a', is_completed: true },
            { id: 'assignment-c', is_completed: false },
        ]);
    });

    it('keeps records available from either durable cache layer', () => {
        const indexedDb = [{ id: 'course-a', user_id: 'student-1', name: 'Biology', notes: 'IndexedDB note' }];
        const localStorage = [{ id: 'course-b', user_id: 'student-1', name: 'Chemistry', notes: 'Fallback note' }];

        expect(mergeCachedRecords(localStorage, indexedDb, 'student-1')).toEqual([
            { id: 'course-b', user_id: 'student-1', name: 'Chemistry', notes: 'Fallback note' },
            { id: 'course-a', user_id: 'student-1', name: 'Biology', notes: 'IndexedDB note' },
        ]);
    });

    it('uses the newer same-ID completion from the fallback cache', () => {
        const merged = mergeCachedRecords(
            [{ id: 'assignment-a', user_id: 'student-1', is_completed: true, _cache_revision: 20 }],
            [{ id: 'assignment-a', user_id: 'student-1', is_completed: false, _cache_revision: 10 }],
            'student-1',
        );

        expect(merged[0].is_completed).toBe(true);
    });

    it('keeps deleted rows hidden when one cache layer still has an older copy', () => {
        const merged = mergeCachedRecords(
            [{ id: 'assignment-a', user_id: 'student-1', title: 'Old row', _cache_revision: 10 }],
            [{ id: 'assignment-a', user_id: 'student-1', _cache_revision: 20, _cache_tombstone: true }],
            'student-1',
        );

        expect(filterCachedRecordsByTombstones(merged)).toEqual([]);
        expect(filterCachedRecordsByTombstones([
            { id: 'assignment-a', _cache_revision: 10 },
            { id: 'assignment-b', _cache_revision: 30 },
        ], { 'assignment-a': 20 })).toEqual([{ id: 'assignment-b', _cache_revision: 30 }]);
    });

    it('queues and replays an offline write when IndexedDB is unavailable', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: true });

        const queued = await queueOfflineMutation('update', 'assignments', { is_completed: true }, [{ column: 'id', value: 'assignment-a' }], 'student-1');
        const sent = [];
        const client = {
            from: (table) => ({
                update(payload) { sent.push({ table, payload }); return this; },
                eq(column, value) { sent[0].filter = { column, value }; return this; },
                then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
            }),
        };

        try {
            expect(queued).toBe(true);
            expect([...values.keys()].filter((key) => key.startsWith('duevinci_offline:pending_mutation:student-1:'))).toHaveLength(1);
            await expect(processOfflineQueue(client, 'student-1')).resolves.toMatchObject({ processed: 1, remaining: 0 });
            expect(sent).toEqual([{ table: 'assignments', payload: { is_completed: true }, filter: { column: 'id', value: 'assignment-a' } }]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('replays legacy array queues alongside new per-mutation entries', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: false });
        const userId = 'student-1';
        const legacyKey = `duevinci_offline:pending_mutations:${userId}`;
        storage.setItem(legacyKey, JSON.stringify([{
            cache_key: 'mut:legacy', action: 'update', table: 'assignments',
            payload: { is_completed: true }, filters: [{ column: 'id', value: 'assignment-a' }],
            user_id: userId, timestamp: 1,
        }]));
        await queueOfflineMutation('update', 'assignments', { is_completed: true }, [{ column: 'id', value: 'assignment-b' }], userId);
        const sent = [];
        const client = {
            from: (table) => {
                const request = { table, filters: [] };
                const builder = {
                    update(payload) { request.payload = payload; return builder; },
                    eq(column, value) { request.filters.push({ column, value }); return builder; },
                    then(resolve, reject) { sent.push(request); return Promise.resolve({ error: null }).then(resolve, reject); },
                };
                return builder;
            },
        };

        try {
            vi.stubGlobal('navigator', { onLine: true });
            await expect(processOfflineQueue(client, userId)).resolves.toMatchObject({ processed: 2, remaining: 0 });
            expect(sent.map((request) => request.filters[0].value).sort()).toEqual(['assignment-a', 'assignment-b']);
            expect(storage.getItem(legacyKey)).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('recovers per-mutation queue entries despite corrupt legacy data and a shifting key list', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: false });
        const userId = 'student-1';
        const legacyKey = `duevinci_offline:pending_mutations:${userId}`;
        const pendingPrefix = `duevinci_offline:pending_mutation:${userId}:`;
        storage.setItem(legacyKey, '{corrupt legacy queue');
        await Promise.all(['assignment-a', 'assignment-b', 'assignment-c'].map((id) =>
            queueOfflineMutation('update', 'assignments', { is_completed: true }, [{ column: 'id', value: id }], userId)));

        let removedByOtherTab = false;
        storage.key = (index) => {
            const key = [...values.keys()][index] ?? null;
            if (!removedByOtherTab && key?.startsWith(pendingPrefix)) {
                removedByOtherTab = true;
                values.delete(key); // This item was completed in another tab.
            }
            return key;
        };
        const sent = [];
        const client = {
            from: (table) => {
                const request = { table, filters: [] };
                const builder = {
                    update(payload) { request.payload = payload; return builder; },
                    eq(column, value) { request.filters.push({ column, value }); return builder; },
                    then(resolve, reject) { sent.push(request); return Promise.resolve({ error: null }).then(resolve, reject); },
                };
                return builder;
            },
        };

        try {
            vi.stubGlobal('navigator', { onLine: true });
            await expect(processOfflineQueue(client, userId)).resolves.toMatchObject({ processed: 2, remaining: 0 });
            expect(sent).toHaveLength(2);
            expect(storage.getItem(legacyKey)).toBe('{corrupt legacy queue');
            expect([...values.keys()].filter((key) => key.startsWith(pendingPrefix))).toHaveLength(0);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps concurrent offline writes from replacing each other in localStorage', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: false });
        const userId = 'student-1';

        try {
            await expect(Promise.all([
                queueOfflineMutation('update', 'assignments', { is_completed: true }, [{ column: 'id', value: 'assignment-a' }], userId),
                queueOfflineMutation('update', 'assignments', { is_completed: true }, [{ column: 'id', value: 'assignment-b' }], userId),
            ])).resolves.toEqual([true, true]);
            const pendingKeys = [...values.keys()].filter((key) => key.startsWith('duevinci_offline:pending_mutation:student-1:'));
            expect(pendingKeys).toHaveLength(2);

            const sent = [];
            const client = {
                from: (table) => {
                    const request = { table, filters: [] };
                    const builder = {
                        update(payload) { request.payload = payload; return builder; },
                        eq(column, value) { request.filters.push({ column, value }); return builder; },
                        then(resolve, reject) { sent.push(request); return Promise.resolve({ error: null }).then(resolve, reject); },
                    };
                    return builder;
                },
            };
            vi.stubGlobal('navigator', { onLine: true });
            await expect(processOfflineQueue(client, userId)).resolves.toMatchObject({ processed: 2, remaining: 0 });
            expect(sent.map((request) => request.filters[0].value).sort()).toEqual(['assignment-a', 'assignment-b']);
            expect([...values.keys()].filter((key) => key.startsWith('duevinci_offline:pending_mutation:student-1:'))).toHaveLength(0);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('clears per-mutation queue entries only for the selected user', async () => {
        const values = new Map([
            ['duevinci_offline:pending_mutation:student-1:mut%3Aone', '{}'],
            ['duevinci_offline:pending_mutation:student-2:mut%3Atwo', '{}'],
        ]);
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);

        try {
            await expect(clearOfflineUserData('student-1')).resolves.toBe(true);
            expect(values.has('duevinci_offline:pending_mutation:student-1:mut%3Aone')).toBe(false);
            expect(values.has('duevinci_offline:pending_mutation:student-2:mut%3Atwo')).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('overlays queued writes on offline reads before cache replay finishes', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: false });
        const userId = 'student-1';
        await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId);
        await queueOfflineMutation('update', 'assignments', { is_completed: true }, [{ column: 'id', value: 'assignment-a' }], userId);
        const client = {
            auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
            from: () => ({ select() { return this; } }),
        };
        const wrapped = createOfflineFirstClient(client);

        try {
            await expect(wrapped.from('assignments').select('*')).resolves.toMatchObject({
                data: [{ id: 'assignment-a', is_completed: true }], error: null,
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('stops a stale cache write after a cross-tab mutation is signaled', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: true });
        const userId = 'student-1';
        await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId);
        let signal = 'read-started';
        const staleWrite = cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId, {
            replace: true,
            shouldWrite: () => signal === 'read-started',
        });
        signal = 'other-tab-committed';
        storage.setItem('duevinci_offline:mutation_signal:assignments:student-1', signal);
        await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: true }], userId, { replace: true });
        await staleWrite;

        try {
            await expect(getLocalCachedData('assignments', userId)).resolves.toEqual([
                { id: 'assignment-a', is_completed: true, user_id: userId },
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not write network snapshots when cross-tab locks are unavailable', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: true });
        const userId = 'student-1';
        await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: true }], userId, { replace: true });

        try {
            await expect(cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId, {
                replace: true,
                shouldWrite: () => true,
            })).resolves.toBe(false);
            await expect(getLocalCachedData('assignments', userId)).resolves.toMatchObject([
                { id: 'assignment-a', is_completed: true },
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('serializes cache commits through the cross-tab table lock', async () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        const locks = new Map();
        const lockManager = {
            request(name, callback) {
                const previous = locks.get(name) || Promise.resolve();
                const current = previous.then(callback, callback);
                locks.set(name, current.then(() => undefined, () => undefined));
                return current;
            },
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: true, locks: lockManager });
        const userId = 'student-1';
        const lockName = `duevinci-offline-cache:${userId}:assignments`;
        storage.setItem('duevinci_offline:mutation_signal:assignments:student-1', 'read-started');
        await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId, { replace: true });
        let staleWrite;

        await lockManager.request(lockName, async () => {
            // This read is queued behind the held writer lock.
            staleWrite = cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId, {
                replace: true,
                shouldWrite: () => storage.getItem('duevinci_offline:mutation_signal:assignments:student-1') === 'read-started',
            });
            storage.setItem('duevinci_offline:mutation_signal:assignments:student-1', 'other-tab-committed');
            await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: true }], userId, {
                replace: true,
                crossTabLockHeld: true,
            });
        });
        await staleWrite;

        try {
            await expect(getLocalCachedData('assignments', userId)).resolves.toMatchObject([
                { id: 'assignment-a', is_completed: true },
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it.each([
        { action: 'update', payload: { is_completed: true }, expected: [{ id: 'assignment-a', is_completed: true }] },
        { action: 'delete', payload: null, expected: [] },
    ])('keeps a pending $action after an older full read races its replay', async ({ action, payload, expected }) => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: false });
        const userId = 'student-1';
        await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId);

        const readStarted = new Promise((resolve) => { globalThis.signalReadStarted = resolve; });
        let releaseStaleRead;
        const staleReadGate = new Promise((resolve) => { releaseStaleRead = resolve; });
        const sent = [];
        const client = {
            auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
            from: (table) => {
                let operation = 'select';
                let updatePayload = null;
                const filters = [];
                const builder = {
                    select() { operation = 'select'; return this; },
                    update(value) { operation = 'update'; updatePayload = value; return this; },
                    delete() { operation = 'delete'; return this; },
                    upsert(value) { operation = 'upsert'; updatePayload = value; return this; },
                    eq(column, value) { filters.push({ column, value }); return this; },
                    then(resolve, reject) {
                        if (operation === 'select') {
                            globalThis.signalReadStarted?.();
                            return staleReadGate.then(() => Promise.resolve({
                                data: [{ id: 'assignment-a', is_completed: false }], count: 1, error: null,
                            }).then(resolve, reject));
                        }
                        sent.push({ table, operation, payload: updatePayload, filters: [...filters] });
                        return Promise.resolve({ error: null }).then(resolve, reject);
                    },
                };
                return builder;
            },
        };
        const wrapped = createOfflineFirstClient(client);

        try {
            let offlineMutation = wrapped.from('assignments');
            offlineMutation = action === 'update'
                ? offlineMutation.update(payload)
                : offlineMutation.delete();
            await offlineMutation.eq('id', 'assignment-a');
            expect([...values.keys()].filter((key) => key.startsWith('duevinci_offline:pending_mutation:student-1:'))).toHaveLength(1);

            vi.stubGlobal('navigator', { onLine: true });
            let resolveRead;
            const staleReadResult = new Promise((resolve) => { resolveRead = resolve; });
            const readPromise = wrapped.from('assignments').select('*').then(resolveRead);
            await readStarted;
            const replayPromise = processOfflineQueue(wrapped, userId);
            await new Promise((resolve) => setTimeout(resolve, 0));
            releaseStaleRead();
            const [response, replay] = await Promise.all([staleReadResult, replayPromise]);

            expect(response.data).toEqual(expected); // Pending work is overlaid on the stale in-flight response.
            expect(replay).toMatchObject({ processed: 1, remaining: 0 });
            expect(sent).toHaveLength(1);
            await expect(getLocalCachedData('assignments', userId)).resolves.toMatchObject(expected);
        } finally {
            delete globalThis.signalReadStarted;
            vi.unstubAllGlobals();
        }
    });

    it.each([
        { label: 'completion', rows: [{ id: 'assignment-a', is_completed: true }], expected: [{ id: 'assignment-a', is_completed: true }] },
        { label: 'delete', rows: [], expected: [] },
    ])('does not let a stale cross-tab full read replace a newer $label', async ({ rows, expected }) => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            get length() { return values.size; },
            key: (index) => [...values.keys()][index] ?? null,
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('navigator', { onLine: true });
        const userId = 'student-1';
        await cacheDataLocally('assignments', [{ id: 'assignment-a', is_completed: false }], userId);
        let releaseStaleRead;
        const staleReadGate = new Promise((resolve) => { releaseStaleRead = resolve; });
        let markReadStarted;
        const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
        const client = {
            auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
            from: () => ({
                select() { return this; },
                then(resolve, reject) {
                    markReadStarted();
                    return staleReadGate.then(() => Promise.resolve({ data: [{ id: 'assignment-a', is_completed: false }], count: 1, error: null }).then(resolve, reject));
                },
            }),
        };
        const wrapped = createOfflineFirstClient(client);

        try {
            let resolveRead;
            const staleResponse = new Promise((resolve) => { resolveRead = resolve; });
            const readPromise = wrapped.from('assignments').select('*').then(resolveRead);
            await readStarted;

            // Simulate another tab committing its cache update and publishing
            // the shared mutation signal while this older fetch is in flight.
            await cacheDataLocally('assignments', rows, userId, { replace: true });
            storage.setItem('duevinci_offline:mutation_signal:assignments:student-1', 'other-tab-committed');
            releaseStaleRead();
            const response = await staleResponse;

            expect(response.data).toMatchObject(expected); // The current renderer receives the local committed state.
            await expect(getLocalCachedData('assignments', userId)).resolves.toEqual(expected);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
