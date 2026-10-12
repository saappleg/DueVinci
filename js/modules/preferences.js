// --- CROSS-DEVICE USER PREFERENCES ---
import { supabaseClient } from './config.js';

const UPDATED_AT_PREFIX = 'duevinci_preferences_updated_at:';
const ACTIVE_USER_KEY = 'duevinci_preferences_account';
const LEGACY_UPDATED_AT_KEY = 'duevinci_preferences_updated_at';
const SYNC_INTERVAL_MS = 20_000;
const SYNCED_PREFERENCE_KEYS = new Set([
    'theme', 'greekTheme', 'focusMinutes', 'breakMinutes', 'timerIsWorking', 'timerCollapsed', 'customTimersExpanded', 'hideUnassigned',
    'duevinci_ambient_noise', 'duevinci_alarm_sound', 'duevinci_date_format', 'duevinci_gpa_scale', 'duevinci_mute_alarm',
    'duevinci_hide_academics', 'duevinci_hide_completed_courses', 'duevinci_show_archived_terms', 'duevinci_terms', 'duevinci_term_details',
    'duevinci_rest_days', 'duevinci_timers', 'duevinci_dashboard_widget_order', 'duevinci_activity_dates',
    'duevinci_assignment_priorities', 'duevinci_assignment_types', 'duevinci_reminders_enabled', 'duevinci_reminder_offsets',
]);
const SYNCED_PREFERENCE_PREFIXES = ['duevinci_workspace_', 'resources_'];
let activeUserId = null;
let lastSnapshot = '';
let syncTimer = null;

function isPreferenceKey(key) {
    return SYNCED_PREFERENCE_KEYS.has(key) || SYNCED_PREFERENCE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function updatedAtKey(userId) {
    return `${UPDATED_AT_PREFIX}${userId}`;
}

export function collectSyncedPreferences() {
    if (typeof localStorage === 'undefined') return {};
    const preferences = {};
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && isPreferenceKey(key)) preferences[key] = localStorage.getItem(key);
    }
    return preferences;
}

export function applySyncedPreferences(preferences = {}) {
    if (typeof localStorage === 'undefined' || !preferences || typeof preferences !== 'object') return;
    Object.entries(preferences).forEach(([key, value]) => {
        if (isPreferenceKey(key) && typeof value === 'string') localStorage.setItem(key, value);
    });
}

function clearSyncedPreferences() {
    if (typeof localStorage === 'undefined') return;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && isPreferenceKey(key)) localStorage.removeItem(key);
    }
}

async function uploadPreferences() {
    if (!activeUserId || typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (localStorage.getItem(ACTIVE_USER_KEY) !== activeUserId) return;
    const preferences = collectSyncedPreferences();
    const snapshot = JSON.stringify(preferences);
    if (snapshot === lastSnapshot) return;
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseClient.from('user_preferences').upsert({ user_id: activeUserId, preferences, updated_at: updatedAt });
    if (error) throw error;
    lastSnapshot = snapshot;
    localStorage.setItem(updatedAtKey(activeUserId), updatedAt);
}

export async function initializePreferenceSync(user) {
    if (!user?.id || typeof localStorage === 'undefined') return;
    if (activeUserId !== user.id && syncTimer) clearInterval(syncTimer);
    const previousUserId = localStorage.getItem(ACTIVE_USER_KEY);
    const hasLegacySharedTimestamp = Boolean(localStorage.getItem(LEGACY_UPDATED_AT_KEY));
    if ((previousUserId && previousUserId !== user.id) || (!previousUserId && hasLegacySharedTimestamp)) clearSyncedPreferences();
    localStorage.removeItem(LEGACY_UPDATED_AT_KEY);
    localStorage.setItem(ACTIVE_USER_KEY, user.id);
    activeUserId = user.id;
    lastSnapshot = '';
    // This table is intentionally cloud-synced, not part of the planner's
    // mutation queue. Never start a request that will hold offline startup
    // behind the browser's network timeout.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const localUpdatedAt = localStorage.getItem(updatedAtKey(user.id)) || '';
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from('user_preferences').select('preferences, updated_at').eq('user_id', user.id).maybeSingle());
    } catch (networkError) {
        console.warn('Preference sync deferred until reconnect:', networkError.message || networkError);
        return;
    }
    if (error) {
        console.warn('Preference sync unavailable:', error.message);
        return;
    }
    if (data?.preferences && data.updated_at > localUpdatedAt) {
        applySyncedPreferences(data.preferences);
        localStorage.setItem(updatedAtKey(user.id), data.updated_at);
        // Timer/theme modules read localStorage at module load. Reload once so
        // the freshly downloaded preferences take effect everywhere.
        window.location.reload();
        return;
    }
    lastSnapshot = '';
    if (!data || localUpdatedAt > (data.updated_at || '')) await uploadPreferences();
    else lastSnapshot = JSON.stringify(collectSyncedPreferences());
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => uploadPreferences().catch((err) => console.warn('Preference sync failed:', err.message)), SYNC_INTERVAL_MS);
    window.addEventListener('online', () => uploadPreferences().catch(() => {}), { once: true });
}

export function stopPreferenceSync() {
    activeUserId = null;
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
}
