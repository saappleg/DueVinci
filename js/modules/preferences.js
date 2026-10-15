// --- CROSS-DEVICE USER PREFERENCES ---
import { supabaseClient } from './config.js';
import { changedPreferenceKeys, mergePreferenceChanges } from './preferenceMerge.js';

const UPDATED_AT_PREFIX = 'duevinci_preferences_updated_at:';
const SNAPSHOT_PREFIX = 'duevinci_preferences_snapshot:';
const PENDING_PREFIX = 'duevinci_preferences_pending:';
const ACTIVE_USER_KEY = 'duevinci_preferences_account';
const RELOAD_GUARD_PREFIX = 'duevinci_preferences_reload_once:';
const LEGACY_UPDATED_AT_KEY = 'duevinci_preferences_updated_at';
const NURSING_WORKSPACE_PREFIX = 'duevinci_workspace_nursing_hub_';
const SYNC_INTERVAL_MS = 20_000;
const MAX_SYNC_ATTEMPTS = 5;
const SYNCED_PREFERENCE_KEYS = new Set([
    'theme', 'greekTheme', 'focusMinutes', 'breakMinutes', 'timerIsWorking', 'timerCollapsed', 'customTimersExpanded', 'hideUnassigned',
    'duevinci_ambient_noise', 'duevinci_alarm_sound', 'duevinci_date_format', 'duevinci_gpa_scale', 'duevinci_mute_alarm',
    'duevinci_hide_academics', 'duevinci_hide_completed_courses', 'duevinci_show_archived_terms', 'duevinci_terms', 'duevinci_term_details',
    'duevinci_rest_days', 'duevinci_no_study_dates', 'duevinci_timers', 'duevinci_dashboard_widget_order', 'duevinci_activity_dates',
    'duevinci_assignment_priorities', 'duevinci_assignment_types', 'duevinci_reminders_enabled', 'duevinci_reminder_offsets',
    'duevinci_week_start_day',
]);
const SYNCED_PREFERENCE_PREFIXES = ['duevinci_workspace_', 'resources_'];
let activeUserId = null;
let syncReadyUserId = null;
let syncTimer = null;
let onlineListener = null;
const uploadsInFlight = new Map();
const initializationsInFlight = new Map();

function isAccountNursingWorkspaceKey(key) {
    return key.startsWith(NURSING_WORKSPACE_PREFIX);
}

function isGeneralPreferenceKey(key) {
    return SYNCED_PREFERENCE_KEYS.has(key) || SYNCED_PREFERENCE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isPreferenceKey(key, userId) {
    if (isAccountNursingWorkspaceKey(key)) return Boolean(userId && key === `${NURSING_WORKSPACE_PREFIX}${userId}`);
    return isGeneralPreferenceKey(key);
}

function normalizePreferences(preferences = {}, userId) {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return {};
    return Object.fromEntries(Object.entries(preferences).filter(([key, value]) => isPreferenceKey(key, userId) && typeof value === 'string'));
}

function updatedAtKey(userId) {
    return `${UPDATED_AT_PREFIX}${userId}`;
}

function snapshotKey(userId) {
    return `${SNAPSHOT_PREFIX}${userId}`;
}

function pendingKey(userId) {
    return `${PENDING_PREFIX}${userId}`;
}

function readSyncedSnapshot(userId) {
    const serialized = localStorage.getItem(snapshotKey(userId));
    if (serialized === null) return null;
    try {
        const parsed = JSON.parse(serialized);
        if (parsed && typeof parsed === 'object' && parsed.version === 2 && parsed.preferences && typeof parsed.synced === 'boolean') {
            return { version: 2, synced: parsed.synced, preferences: normalizePreferences(parsed.preferences, userId) };
        }
        // Earlier builds stored a plain preferences object. It was written only
        // after a successful cloud sync, so it remains a valid baseline.
        return { version: 2, synced: true, preferences: normalizePreferences(parsed, userId) };
    } catch {
        return null;
    }
}

function preferencesMatchCommittedSnapshot(userId) {
    const snapshot = readSyncedSnapshot(userId);
    return Boolean(snapshot?.synced && changedPreferenceKeys(snapshot.preferences, collectSyncedPreferences(userId)).size === 0);
}

function writeSyncedSnapshot(userId, preferences, synced = true) {
    localStorage.setItem(snapshotKey(userId), JSON.stringify({
        version: 2,
        synced: Boolean(synced),
        preferences: normalizePreferences(preferences, userId),
    }));
}

export function collectSyncedPreferences(userId = activeUserId) {
    if (typeof localStorage === 'undefined') return {};
    const preferences = {};
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && isPreferenceKey(key, userId)) preferences[key] = localStorage.getItem(key);
    }
    return preferences;
}

export function applySyncedPreferences(preferences = {}, userId = activeUserId) {
    if (typeof localStorage === 'undefined') return;
    Object.entries(normalizePreferences(preferences, userId)).forEach(([key, value]) => localStorage.setItem(key, value));
}

function replaceSyncedPreferences(preferences = {}, userId) {
    if (typeof localStorage === 'undefined') return;
    const safePreferences = normalizePreferences(preferences, userId);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && isPreferenceKey(key, userId) && !Object.hasOwn(safePreferences, key)) localStorage.removeItem(key);
    }
    applySyncedPreferences(safePreferences, userId);
}

function clearSyncedPreferences() {
    if (typeof localStorage === 'undefined') return;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        // Nursing workspace records are account-scoped by key. Keep every
        // user's local copy when switching accounts; only clear shared prefs.
        if (key && isGeneralPreferenceKey(key) && !isAccountNursingWorkspaceKey(key)) localStorage.removeItem(key);
    }
}

function storePendingPreferences(userId) {
    if (!userId || typeof localStorage === 'undefined') return;
    const baseline = readSyncedSnapshot(userId) || { version: 2, synced: false, preferences: {} };
    localStorage.setItem(pendingKey(userId), JSON.stringify({
        version: 1,
        baseline,
        preferences: collectSyncedPreferences(userId),
    }));
}

function restorePendingPreferences(userId) {
    const serialized = localStorage.getItem(pendingKey(userId));
    if (!serialized) return false;
    try {
        const pending = JSON.parse(serialized);
        if (pending?.version !== 1 || !pending.preferences || typeof pending.preferences !== 'object') return false;
        const safePreferences = normalizePreferences(pending.preferences, userId);
        clearSyncedPreferences();
        applySyncedPreferences(safePreferences, userId);
        if (pending.baseline && typeof pending.baseline === 'object') {
            writeSyncedSnapshot(userId, pending.baseline.preferences || {}, pending.baseline.synced !== false);
        }
        return true;
    } catch {
        return false;
    }
}

function nextUpdatedAt(previousTimestamp = '') {
    const previousMilliseconds = Date.parse(previousTimestamp);
    const nextMilliseconds = Math.max(Date.now(), Number.isFinite(previousMilliseconds) ? previousMilliseconds + 1 : 0);
    return new Date(nextMilliseconds).toISOString();
}

function isCurrentUser(userId) {
    return activeUserId === userId && localStorage.getItem(ACTIVE_USER_KEY) === userId;
}

async function readRemotePreferences(userId) {
    return supabaseClient.from('user_preferences')
        .select('preferences, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
}

async function writeRemotePreferences(userId, remote, preferences, updatedAt) {
    const payload = { user_id: userId, preferences, updated_at: updatedAt };
    if (!remote) {
        const { data, error } = await supabaseClient.from('user_preferences').insert(payload).select('updated_at').maybeSingle();
        if (error && error.code === '23505') return { conflict: true };
        if (error) throw error;
        return { conflict: false, updatedAt: data?.updated_at || updatedAt };
    }

    let updateQuery = supabaseClient.from('user_preferences')
        .update({ preferences, updated_at: updatedAt })
        .eq('user_id', userId);
    updateQuery = remote.updated_at == null
        ? updateQuery.is('updated_at', null)
        : updateQuery.eq('updated_at', remote.updated_at);
    const { data, error } = await updateQuery.select('updated_at').maybeSingle();
    if (error) throw error;
    if (!data) return { conflict: true };
    return { conflict: false, updatedAt: data.updated_at || updatedAt };
}

async function synchronizePreferences(userId, baselineState) {
    const initialLocal = collectSyncedPreferences(userId);
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
        if (!isCurrentUser(userId)) return { stale: true, localChanged: false };
        const { data, error } = await readRemotePreferences(userId);
        if (error) throw error;
        if (!isCurrentUser(userId)) return { stale: true, localChanged: false };

        // Include edits made while the remote row was loading.
        const local = collectSyncedPreferences(userId);
        const remote = data ? normalizePreferences(data.preferences, userId) : {};
        let merged;

        if (!data) {
            // A missing row is a first sync. Keep all current local settings.
            // Route through the same validation used by conflict merges before
            // inserting anything, so a damaged Nursing draft cannot become a
            // new cloud baseline.
            merged = mergePreferenceChanges({}, local, new Set(Object.keys(local)), {});
        } else {
            const baseline = baselineState?.preferences || {};
            // A baseline created while offline is intentionally empty: retain
            // locally present settings and never infer account-wide deletions.
            const comparisonBase = baselineState?.synced === false ? {} : baseline;
            const localChanges = changedPreferenceKeys(comparisonBase, local);
            merged = mergePreferenceChanges(remote, local, localChanges, baseline);
        }

        if (!isCurrentUser(userId)) return { stale: true, localChanged: false };
        let syncedAt = data?.updated_at || '';
        if (!data || JSON.stringify(merged) !== JSON.stringify(remote)) {
            const updatedAt = nextUpdatedAt(data?.updated_at || '');
            const result = await writeRemotePreferences(userId, data, merged, updatedAt);
            if (result.conflict) continue;
            if (!isCurrentUser(userId)) return { stale: true, localChanged: false };
            syncedAt = result.updatedAt;
        }

        // The conditional write succeeded (or no write was needed). Preserve
        // edits made in flight as dirty changes against the exact saved payload.
        const localAfterWrite = collectSyncedPreferences(userId);
        const editsDuringWrite = changedPreferenceKeys(local, localAfterWrite);
        const finalLocal = mergePreferenceChanges(merged, localAfterWrite, editsDuringWrite, local);
        replaceSyncedPreferences(finalLocal, userId);
        writeSyncedSnapshot(userId, merged);
        localStorage.removeItem(pendingKey(userId));
        if (syncedAt) localStorage.setItem(updatedAtKey(userId), syncedAt);
        return {
            stale: false,
            localChanged: JSON.stringify(initialLocal) !== JSON.stringify(finalLocal),
        };
    }
    throw new Error('Preference sync could not finish because another device kept updating the account.');
}

function uploadPreferences() {
    const userId = activeUserId;
    if (!userId || typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
    const existing = uploadsInFlight.get(userId);
    if (existing) return existing;

    const baseline = readSyncedSnapshot(userId) || { version: 2, synced: false, preferences: {} };
    const task = synchronizePreferences(userId, baseline).finally(() => {
        if (uploadsInFlight.get(userId) === task) uploadsInFlight.delete(userId);
    });
    uploadsInFlight.set(userId, task);
    return task;
}

function ensureSyncTimer() {
    if (syncTimer) return;
    syncTimer = setInterval(() => {
        const userId = activeUserId;
        if (!userId) return;
        if (syncReadyUserId === userId) {
            uploadPreferences().catch((error) => console.warn('Preference sync failed:', error.message || error));
        } else {
            initializePreferenceSync({ id: userId }).catch((error) => console.warn('Preference sync retry failed:', error.message || error));
        }
    }, SYNC_INTERVAL_MS);
}

function installOnlineListener() {
    if (onlineListener || typeof window === 'undefined') return;
    onlineListener = () => {
        if (!activeUserId) return;
        if (syncReadyUserId === activeUserId) {
            uploadPreferences().catch((error) => console.warn('Preference sync deferred after reconnect:', error.message || error));
            return;
        }
        initializePreferenceSync({ id: activeUserId }).catch((error) => {
            console.warn('Preference sync deferred after reconnect:', error.message || error);
        });
    };
    window.addEventListener('online', onlineListener);
}

async function initializePreferenceSyncForUser(user) {
    const userId = user.id;
    if (!userId || typeof localStorage === 'undefined') return;

    if (activeUserId !== userId) {
        if (activeUserId) storePendingPreferences(activeUserId);
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = null;
        syncReadyUserId = null;
    }

    const previousUserId = localStorage.getItem(ACTIVE_USER_KEY);
    const accountChanged = Boolean(previousUserId && previousUserId !== userId);
    if (accountChanged) {
        // Preserve the previous account's unsynced preferences before clearing
        // shared keys, then restore this account's own pending device snapshot.
        storePendingPreferences(previousUserId);
        clearSyncedPreferences();
        const restoredPending = restorePendingPreferences(userId);
        if (!restoredPending) {
            const existingSnapshot = readSyncedSnapshot(userId);
            if (existingSnapshot) applySyncedPreferences(existingSnapshot.preferences, userId);
            else writeSyncedSnapshot(userId, {}, false);
        }
    }

    localStorage.removeItem(LEGACY_UPDATED_AT_KEY);
    localStorage.setItem(ACTIVE_USER_KEY, userId);
    activeUserId = userId;
    installOnlineListener();

    // This table is intentionally cloud-synced, not part of the planner's
    // mutation queue. Never start a request that can block offline startup.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!readSyncedSnapshot(userId)) writeSyncedSnapshot(userId, {}, false);
        return;
    }

    let baseline = readSyncedSnapshot(userId);
    if (!baseline) {
        baseline = { version: 2, synced: false, preferences: {} };
        writeSyncedSnapshot(userId, baseline.preferences, false);
    }

    let result;
    try {
        result = await synchronizePreferences(userId, baseline);
    } catch (error) {
        console.warn('Preference sync deferred until retry:', error.message || error);
        return;
    }
    if (result.stale || !isCurrentUser(userId)) return;

    syncReadyUserId = userId;
    ensureSyncTimer();
    const reloadGuardKey = `${RELOAD_GUARD_PREFIX}${userId}`;
    if (result.localChanged && typeof window !== 'undefined' && window.location) {
        // Persist the guard across a reload so a repeatedly detected preference
        // difference cannot trap the dashboard in a reload loop.
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(reloadGuardKey) !== '1') {
                sessionStorage.setItem(reloadGuardKey, '1');
                window.location.reload();
            }
        } catch (error) {
            // If session storage is unavailable, keep the page stable.
            console.warn('Preference refresh skipped because the reload guard is unavailable:', error.message || error);
        }
    } else if (!result.localChanged) {
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(reloadGuardKey);
        } catch { /* Storage can be disabled by the browser. */ }
    }
}

export function initializePreferenceSync(user) {
    if (!user?.id || typeof localStorage === 'undefined') return Promise.resolve();
    const existing = initializationsInFlight.get(user.id);
    if (existing) return existing;
    const task = initializePreferenceSyncForUser(user).finally(() => {
        if (initializationsInFlight.get(user.id) === task) initializationsInFlight.delete(user.id);
        // Network failures retry periodically; offline startup waits for the
        // browser's online event before making another request.
        if (activeUserId === user.id && typeof navigator !== 'undefined' && navigator.onLine !== false) ensureSyncTimer();
    });
    initializationsInFlight.set(user.id, task);
    return task;
}

export async function syncPreferencesNow() {
    const userId = activeUserId || (typeof window !== 'undefined' ? window.currentUser?.id : null);
    if (!userId || typeof localStorage === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        storePendingPreferences(userId);
        return false;
    }
    try {
        if (activeUserId !== userId || syncReadyUserId !== userId) {
            await initializePreferenceSync({ id: userId });
            if (syncReadyUserId !== userId) {
                storePendingPreferences(userId);
                return false;
            }
        }
        // An edit can arrive while a request is already in flight. Upload
        // again until the latest local snapshot matches the committed one so
        // callers never announce a save as synced prematurely.
        for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
            await uploadPreferences();
            if (!isCurrentUser(userId) || syncReadyUserId !== userId) return false;
            if (preferencesMatchCommittedSnapshot(userId)) return true;
        }
        storePendingPreferences(userId);
        return false;
    } catch (error) {
        storePendingPreferences(userId);
        console.warn('Immediate preference sync deferred:', error.message || error);
        return false;
    }
}

export function stopPreferenceSync() {
    if (activeUserId) storePendingPreferences(activeUserId);
    activeUserId = null;
    syncReadyUserId = null;
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
    if (onlineListener && typeof window !== 'undefined') window.removeEventListener('online', onlineListener);
    onlineListener = null;
}

if (typeof window !== 'undefined') window.syncPreferencesNow = syncPreferencesNow;
