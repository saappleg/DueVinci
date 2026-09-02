// --- DATA BACKUP & RESTORE MODULE ---
import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { getLocalDateKey } from './utils.js';

export function buildBackupPayload(courses = [], assignments = [], customEvents = [], timers = [], preferences = {}) {
    return {
        version: "1.0",
        app: "DueVinci",
        exportedAt: new Date().toISOString(),
        data: {
            courses: Array.isArray(courses) ? courses : [],
            assignments: Array.isArray(assignments) ? assignments : [],
            customEvents: Array.isArray(customEvents) ? customEvents : [],
            timers: Array.isArray(timers) ? timers : [],
            preferences: preferences && typeof preferences === 'object' ? preferences : {}
        }
    };
}

export function validateBackupPayload(json) {
    if (!json || typeof json !== 'object') return { valid: false, error: 'Invalid JSON root' };
    if (!json.data || typeof json.data !== 'object') return { valid: false, error: 'Missing data object' };
    if (!Array.isArray(json.data.courses)) return { valid: false, error: 'courses must be an array' };
    if (!Array.isArray(json.data.assignments)) return { valid: false, error: 'assignments must be an array' };
    return { valid: true };
}

export async function exportUserDataJSON() {
    try {
        const { data: courses } = await supabaseClient.from('courses').select('*');
        const { data: assignments } = await supabaseClient.from('assignments').select('*');
        const { data: customEvents } = await supabaseClient.from('custom_events').select('*');
        const timers = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('duevinci_timers'))) || [];

        const prefs = {
            theme: typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null,
            dateFormat: typeof localStorage !== 'undefined' ? localStorage.getItem('duevinci_date_format') : null,
            gpaScale: typeof localStorage !== 'undefined' ? localStorage.getItem('duevinci_gpa_scale') : null,
            muteAlarm: typeof localStorage !== 'undefined' ? localStorage.getItem('duevinci_mute_alarm') : null,
            hideAcademics: typeof localStorage !== 'undefined' ? localStorage.getItem('duevinci_hide_academics') : null,
            activityDates: typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('duevinci_activity_dates') || '[]') : []
        };

        const payload = buildBackupPayload(courses || [], assignments || [], customEvents || [], timers, prefs);
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
        alert('Failed to export backup data.');
    }
}

export async function syncDataWithSupabase() {
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

        alert(`✅ Supabase Cloud Sync Successful!\nAccount: ${user.email}\n• ${courses?.length || 0} Courses Synchronized\n• ${assignments?.length || 0} Assignments Synchronized`);
    } catch (err) {
        console.error('Error syncing with Supabase:', err);
        alert('Supabase cloud sync failed. Please check network connection.');
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

            if (json.data.timers && Array.isArray(json.data.timers) && typeof localStorage !== 'undefined') {
                localStorage.setItem('duevinci_timers', JSON.stringify(json.data.timers));
            }

            if (json.data.preferences && typeof localStorage !== 'undefined') {
                if (json.data.preferences.theme) localStorage.setItem('theme', json.data.preferences.theme);
                if (json.data.preferences.gpaScale) localStorage.setItem('duevinci_gpa_scale', json.data.preferences.gpaScale);
                if (json.data.preferences.dateFormat) localStorage.setItem('duevinci_date_format', json.data.preferences.dateFormat);
                if (json.data.preferences.activityDates) localStorage.setItem('duevinci_activity_dates', JSON.stringify(json.data.preferences.activityDates));
            }

            // Sync restored courses and assignments to Supabase
            let user = currentUser;
            if (!user && supabaseClient && supabaseClient.auth) {
                const sessionRes = await supabaseClient.auth.getUser();
                user = sessionRes.data?.user;
            }

            if (supabaseClient && user) {
                if (Array.isArray(json.data.courses) && json.data.courses.length > 0) {
                    const coursesToUpsert = json.data.courses.map(c => ({ ...c, user_id: user.id }));
                    await supabaseClient.from('courses').upsert(coursesToUpsert);
                }
                if (Array.isArray(json.data.assignments) && json.data.assignments.length > 0) {
                    const assignmentsToUpsert = json.data.assignments.map(a => ({ ...a, user_id: user.id }));
                    await supabaseClient.from('assignments').upsert(assignmentsToUpsert);
                }
                if (Array.isArray(json.data.customEvents) && json.data.customEvents.length > 0) {
                    const eventsToUpsert = json.data.customEvents.map(ev => ({ ...ev, user_id: user.id }));
                    await supabaseClient.from('custom_events').upsert(eventsToUpsert);
                }
            }

            alert('Backup data and Supabase cloud sync restored successfully! Refreshing page...');
            if (typeof window !== 'undefined') window.location.reload();
        } catch (err) {
            console.error('Failed to parse backup JSON:', err);
            alert('Failed to parse the backup file. Ensure it is valid JSON.');
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
