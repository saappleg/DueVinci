// --- CROSS-DEVICE USER PREFERENCES ---
import { supabaseClient } from './config.js';

const UPDATED_AT_KEY = 'duevinci_preferences_updated_at';
const SYNC_INTERVAL_MS = 20_000;
let activeUserId = null;
let lastSnapshot = '';
let syncTimer = null;

function isPreferenceKey(key) {
    return key === 'theme' || key === 'greekTheme' || key === 'focusMinutes' || key === 'breakMinutes'
        || key === 'timerIsWorking' || key === 'timerCollapsed' || key === 'customTimersExpanded'
        || key === 'hideUnassigned' || key.startsWith('duevinci_') || key.startsWith('resources_');
}

function collectPreferences() {
    if (typeof localStorage === 'undefined') return {};
    const preferences = {};
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && isPreferenceKey(key) && key !== UPDATED_AT_KEY) preferences[key] = localStorage.getItem(key);
    }
    return preferences;
}

function applyPreferences(preferences = {}) {
    if (typeof localStorage === 'undefined' || !preferences || typeof preferences !== 'object') return;
    Object.entries(preferences).forEach(([key, value]) => {
        if (isPreferenceKey(key) && typeof value === 'string') localStorage.setItem(key, value);
    });
}

async function uploadPreferences() {
    if (!activeUserId || typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const preferences = collectPreferences();
    const snapshot = JSON.stringify(preferences);
    if (snapshot === lastSnapshot) return;
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseClient.from('user_preferences').upsert({ user_id: activeUserId, preferences, updated_at: updatedAt });
    if (error) throw error;
    lastSnapshot = snapshot;
    localStorage.setItem(UPDATED_AT_KEY, updatedAt);
}

export async function initializePreferenceSync(user) {
    if (!user?.id || typeof localStorage === 'undefined') return;
    activeUserId = user.id;
    const localUpdatedAt = localStorage.getItem(UPDATED_AT_KEY) || '';
    const { data, error } = await supabaseClient.from('user_preferences').select('preferences, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) {
        console.warn('Preference sync unavailable:', error.message);
        return;
    }
    if (data?.preferences && data.updated_at > localUpdatedAt) {
        applyPreferences(data.preferences);
        localStorage.setItem(UPDATED_AT_KEY, data.updated_at);
        // Timer/theme modules read localStorage at module load. Reload once so
        // the freshly downloaded preferences take effect everywhere.
        window.location.reload();
        return;
    }
    lastSnapshot = '';
    if (!data || localUpdatedAt > (data.updated_at || '')) await uploadPreferences();
    else lastSnapshot = JSON.stringify(collectPreferences());
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => uploadPreferences().catch((err) => console.warn('Preference sync failed:', err.message)), SYNC_INTERVAL_MS);
    window.addEventListener('online', () => uploadPreferences().catch(() => {}), { once: true });
}

export function stopPreferenceSync() {
    activeUserId = null;
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
}
