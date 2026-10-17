// --- DATA BACKUP & RESTORE MODULE ---
import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { getLocalDateKey } from './utils.js';
import { collectLocalFlashcardMastery, mergeFlashcardMastery, restoreFlashcardMastery } from './flashcards.js';
import { applySyncedPreferences, collectSyncedPreferences } from './preferences.js';
import { processOfflineQueue } from './offlineDb.js';

export function buildBackupPayload(courses = [], assignments = [], customEvents = [], timers = [], preferences = {}, flashcardMastery = {}) {
    return {
        version: "1.0",
        app: "DueVinci",
        exportedAt: new Date().toISOString(),
        data: {
            courses: Array.isArray(courses) ? courses : [],
            assignments: Array.isArray(assignments) ? assignments : [],
            customEvents: Array.isArray(customEvents) ? customEvents : [],
            timers: Array.isArray(timers) ? timers : [],
            preferences: preferences && typeof preferences === 'object' ? preferences : {},
            flashcardMastery: flashcardMastery && typeof flashcardMastery === 'object' && !Array.isArray(flashcardMastery) ? flashcardMastery : {}
        }
    };
}

export function validateBackupPayload(json) {
    if (!json || typeof json !== 'object') return { valid: false, error: 'Invalid JSON root' };
    if (!json.data || typeof json.data !== 'object') return { valid: false, error: 'Missing data object' };
    if (!Array.isArray(json.data.courses)) return { valid: false, error: 'courses must be an array' };
    if (!Array.isArray(json.data.assignments)) return { valid: false, error: 'assignments must be an array' };
    if (json.data.flashcardMastery !== undefined
        && (!json.data.flashcardMastery || typeof json.data.flashcardMastery !== 'object' || Array.isArray(json.data.flashcardMastery))) {
        return { valid: false, error: 'flashcardMastery must be an object' };
    }
    return { valid: true };
}

export async function exportUserDataJSON() {
    try {
        const { data: courses, error: coursesError } = await supabaseClient.from('courses').select('*');
        if (coursesError) throw new Error('Could not load courses for the backup.');
        const { data: assignments, error: assignmentsError } = await supabaseClient.from('assignments').select('*');
        if (assignmentsError) throw new Error('Could not load assignments for the backup.');
        const { data: customEvents, error: customEventsError } = await supabaseClient.from('custom_events').select('*');
        if (customEventsError) throw new Error('Could not load calendar events for the backup.');
        const timers = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('duevinci_timers'))) || [];
        let flashcardMastery = collectLocalFlashcardMastery();
        let cloudMasteryUnavailable = false;
        try {
            const { data: cloudMastery, error } = await supabaseClient.from('flashcard_mastery').select('course_id, mastery');
            if (!error) {
                (cloudMastery || []).forEach((row) => {
                    const courseId = String(row.course_id);
                    flashcardMastery[courseId] = mergeFlashcardMastery(flashcardMastery[courseId] || {}, row.mastery || {});
                });
            } else cloudMasteryUnavailable = true;
        } catch { cloudMasteryUnavailable = true; }

        if (cloudMasteryUnavailable && typeof window !== 'undefined'
            && !window.confirm('Synced flashcard progress could not be loaded. Download a backup with only progress saved on this device?')) {
            return;
        }

        const prefs = collectSyncedPreferences();

        const payload = buildBackupPayload(courses || [], assignments || [], customEvents || [], timers, prefs, flashcardMastery);
        const jsonStr = JSON.stringify(payload, null, 2);

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `duevinci-backup-${getLocalDateKey()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Error exporting backup:', err);
        alert('A complete backup could not be created, so no file was downloaded. Check your connection and try again.');
    }
}

export async function syncDataWithSupabase() {
    let syncSummary = { processed: 0, remaining: 0 };
    try {
        if (!supabaseClient) {
            alert('Supabase client is not initialized.');
            return;
        }
        let user = currentUser;
        if (!user && supabaseClient.auth) {
            const { data } = await supabaseClient.auth.getUser();
            user = data?.user;
        }
        if (!user) {
            alert('Please sign in to sync with your Supabase cloud database.');
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            alert('You are offline. Your local changes are still saved on this device; reconnect before syncing and refreshing cloud data.');
            return;
        }

        syncSummary = await processOfflineQueue(supabaseClient, user.id);
        if (syncSummary.remaining > 0) {
            const saved = syncSummary.processed;
            alert(`Sync is incomplete. ${saved} queued change${saved === 1 ? '' : 's'} saved; ${syncSummary.remaining} still waiting. Cloud data was not refreshed so your pending local changes stay visible. Try again when your connection is stable.`);
            return;
        }

        // Fetch latest cloud state
        const { data: courses, error: cErr } = await supabaseClient.from('courses').select('*');
        if (cErr) throw cErr;

        const { data: assignments, error: aErr } = await supabaseClient.from('assignments').select('*');
        if (aErr) throw aErr;

        if (typeof window !== 'undefined') {
            window.localCourses = courses || [];
            if (typeof window.renderStudyPlanDashboardWidget === 'function') {
                window.renderStudyPlanDashboardWidget('studyPlanWidgetContainer');
            }
            if (typeof window.renderAcademicsDashboardWidget === 'function') {
                window.renderAcademicsDashboardWidget('dashboardGrid');
            }
        }

        alert(`✅ Sync complete\nAccount: ${user.email}\n• ${syncSummary.processed} queued change${syncSummary.processed === 1 ? '' : 's'} saved\n• ${courses?.length || 0} Courses Loaded\n• ${assignments?.length || 0} Assignments Loaded`);
    } catch (err) {
        console.error('Error refreshing from Supabase:', err);
        const saved = syncSummary.processed;
        const savedNotice = saved ? `${saved} queued change${saved === 1 ? ' was' : 's were'} saved, but ` : '';
        alert(`${savedNotice}the latest cloud data could not be loaded. Your local changes remain available; check your connection and try again.`);
    }
}

export async function importUserDataJSON(fileInput) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const json = JSON.parse(e.target.result);
            const validation = validateBackupPayload(json);
            if (!validation.valid) {
                alert(`Invalid backup file: ${validation.error}`);
                return;
            }

            if (!confirm(`Restore ${json.data.courses.length} courses and ${json.data.assignments.length} assignments from this backup?`)) {
                return;
            }

            // Sync restored courses and assignments to Supabase
            let user = currentUser;
            if (!user && supabaseClient && supabaseClient.auth) {
                const sessionRes = await supabaseClient.auth.getUser();
                user = sessionRes.data?.user;
            }
            if (!supabaseClient || !user) throw new Error('Sign in before restoring course and assignment data.');

            const restoredTables = [];
            const restoreTable = async (tableName, records) => {
                if (!Array.isArray(records) || records.length === 0) return;
                const rows = records.map((record) => ({ ...record, user_id: user.id }));
                const { error } = await supabaseClient.from(tableName).upsert(rows);
                if (error) {
                    const prior = restoredTables.length ? ` Already restored: ${restoredTables.join(', ')}.` : '';
                    throw new Error(`Could not restore ${tableName}: ${error.message || 'cloud write failed'}.${prior}`);
                }
                restoredTables.push(tableName);
            };

            await restoreTable('courses', json.data.courses);
            await restoreTable('assignments', json.data.assignments);
            await restoreTable('custom_events', json.data.customEvents);

            if (json.data.timers && Array.isArray(json.data.timers) && typeof localStorage !== 'undefined') {
                localStorage.setItem('duevinci_timers', JSON.stringify(json.data.timers));
            }
            if (json.data.preferences && typeof localStorage !== 'undefined') {
                applySyncedPreferences(json.data.preferences);
                // Support portable backups created before settings used their localStorage keys.
                const legacyPreferenceMap = {
                    dateFormat: 'duevinci_date_format',
                    gpaScale: 'duevinci_gpa_scale',
                    muteAlarm: 'duevinci_mute_alarm',
                    hideAcademics: 'duevinci_hide_academics',
                };
                Object.entries(legacyPreferenceMap).forEach(([legacyKey, currentKey]) => {
                    const value = json.data.preferences[legacyKey];
                    if (typeof value === 'string') applySyncedPreferences({ [currentKey]: value });
                });
                if (Array.isArray(json.data.preferences.activityDates)) {
                    applySyncedPreferences({ duevinci_activity_dates: JSON.stringify(json.data.preferences.activityDates) });
                }
            }
            restoreFlashcardMastery(json.data.flashcardMastery || {});

            alert('Backup data and Supabase cloud sync restored successfully! Refreshing page...');
            if (typeof window !== 'undefined') window.location.reload();
        } catch (err) {
            console.error('Failed to restore backup:', err);
            alert(`Failed to restore backup: ${err.message || 'Check the file and your cloud connection.'}`);
        }
    };

    reader.readAsText(file);
}

// Bind to window / globalThis for test suites and HTML events
const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.buildBackupPayload = buildBackupPayload;
_scope.validateBackupPayload = validateBackupPayload;
_scope.exportUserDataJSON = exportUserDataJSON;
_scope.importUserDataJSON = importUserDataJSON;
_scope.syncDataWithSupabase = syncDataWithSupabase;
