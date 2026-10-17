import { getSubscriptionSnapshot, hasSubscriptionFeature } from './subscription.js';
import { syncPreferencesNow } from './preferences.js';

export const STUDY_CALIBRATION_ENABLED_KEY = 'duevinci_study_calibration_enabled';
export const STUDY_CALIBRATION_HISTORY_KEY = 'duevinci_study_history';
const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_FOCUS_SESSIONS = 180;
const MAX_COMPLETED_TASKS = 120;

function safeParse(value, fallback) {
    try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

export function isStudyCalibrationEnabled() {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STUDY_CALIBRATION_ENABLED_KEY) === 'true';
}

export function getStudyCalibrationHistory() {
    if (typeof localStorage === 'undefined') return { version: 1, sessions: [], completions: [] };
    const stored = safeParse(localStorage.getItem(STUDY_CALIBRATION_HISTORY_KEY), null);
    if (!stored || stored.version !== 1 || !Array.isArray(stored.sessions) || !Array.isArray(stored.completions)) {
        return { version: 1, sessions: [], completions: [] };
    }
    return { version: 1, sessions: stored.sessions, completions: stored.completions };
}

function saveHistory(history) {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.setItem(STUDY_CALIBRATION_HISTORY_KEY, JSON.stringify({
            version: 1,
            sessions: history.sessions.slice(-MAX_FOCUS_SESSIONS),
            completions: history.completions.slice(-MAX_COMPLETED_TASKS),
        }));
        return true;
    } catch (error) {
        console.warn('Study calibration history could not be saved:', error?.message || error);
        return false;
    }
}

export function normalizeStudyTaskType(task = {}) {
    const value = String(task.taskType || task.task_type || task.type || '').trim().toLowerCase();
    if (value === 'exam' || /exam|final|midterm|test/i.test(task.title || '')) return 'exam';
    if (value === 'lab' || /lab|project|code|program/i.test(task.title || '')) return 'lab';
    if (value === 'reading' || /reading|chapter|textbook/i.test(task.title || '')) return 'reading';
    if (value === 'review' || /review|recap|summary|synthesis/i.test(task.title || '')) return 'review';
    return 'lesson';
}

export function getDefaultStudyEstimate(task = {}) {
    const custom = Number(task.estimatedMinutes ?? task.estimated_minutes);
    if (Number.isInteger(custom) && custom >= 5 && custom <= 480) return custom;
    return ({ exam: 50, lab: 45, reading: 35, review: 30, lesson: 25 })[normalizeStudyTaskType(task)];
}

export function recordCompletedFocusSession({ taskId = null, courseId = null, taskType = '', title = '', minutes = 25, recordedAt = new Date().toISOString() } = {}) {
    if (!isStudyCalibrationEnabled()) return false;
    const cleanMinutes = Math.round(Number(minutes));
    if (!Number.isFinite(cleanMinutes) || cleanMinutes < 1 || cleanMinutes > 240) return false;
    const history = getStudyCalibrationHistory();
    history.sessions.push({
        taskId: taskId == null ? null : String(taskId),
        courseId: courseId == null ? null : String(courseId),
        taskType: normalizeStudyTaskType({ taskType, title }),
        minutes: cleanMinutes,
        recordedAt: String(recordedAt),
    });
    return saveHistory(history);
}

async function canRecordStudyHistory() {
    if (!isStudyCalibrationEnabled()) return false;
    try {
        const snapshot = await getSubscriptionSnapshot();
        return hasSubscriptionFeature(snapshot, 'study_plan_calibration');
    } catch {
        return false;
    }
}

export async function recordCompletedFocusSessionIfEntitled(session = {}) {
    if (!await canRecordStudyHistory()) return false;
    return recordCompletedFocusSession(session);
}

export function recordStudyPlanCompletion({ taskId, courseId = null, taskType = '', title = '', estimatedMinutes = null, completedAt = new Date().toISOString() } = {}) {
    if (!isStudyCalibrationEnabled() || taskId == null) return false;
    const task = { taskType, title, estimatedMinutes };
    const history = getStudyCalibrationHistory();
    history.completions = history.completions.filter((completion) => String(completion.taskId) !== String(taskId));
    history.completions.push({
        taskId: String(taskId),
        courseId: courseId == null ? null : String(courseId),
        taskType: normalizeStudyTaskType(task),
        estimatedMinutes: getDefaultStudyEstimate(task),
        completedAt: String(completedAt),
    });
    return saveHistory(history);
}

export async function recordStudyPlanCompletionIfEntitled(completion = {}) {
    if (!await canRecordStudyHistory()) return false;
    return recordStudyPlanCompletion(completion);
}

export function removeStudyPlanCompletion(taskId) {
    if (typeof localStorage === 'undefined' || taskId == null) return false;
    const history = getStudyCalibrationHistory();
    history.completions = history.completions.filter((completion) => String(completion.taskId) !== String(taskId));
    return saveHistory(history);
}

function median(values) {
    if (!values.length) return 1;
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function boundedRatio(value) {
    return Math.max(0.65, Math.min(1.75, value));
}

export function calculateStudyCalibration(history = getStudyCalibrationHistory(), now = Date.now()) {
    const cutoff = now - HISTORY_WINDOW_MS;
    const recentSessions = (history.sessions || []).filter((session) => {
        const time = Date.parse(session.recordedAt || '');
        return Number.isFinite(time) && time >= cutoff && time <= now;
    });
    const sessionsByTask = new Map();
    recentSessions.forEach((session) => {
        if (!session.taskId) return;
        const taskId = String(session.taskId);
        sessionsByTask.set(taskId, (sessionsByTask.get(taskId) || 0) + Math.max(0, Number(session.minutes) || 0));
    });

    const trackedCompletions = (history.completions || []).flatMap((completion) => {
        const completedAt = Date.parse(completion.completedAt || '');
        const actualMinutes = sessionsByTask.get(String(completion.taskId)) || 0;
        const estimatedMinutes = Number(completion.estimatedMinutes);
        if (!Number.isFinite(completedAt) || completedAt < cutoff || completedAt > now
            || actualMinutes < 5 || !Number.isFinite(estimatedMinutes) || estimatedMinutes < 5) return [];
        return [{
            ...completion,
            taskType: normalizeStudyTaskType(completion),
            actualMinutes: Math.min(480, actualMinutes),
            estimatedMinutes,
        }];
    });
    const globalRatio = median(trackedCompletions.map((item) => item.actualMinutes / item.estimatedMinutes));
    const ratios = {};
    ['lesson', 'reading', 'lab', 'review', 'exam'].forEach((type) => {
        const sample = trackedCompletions.filter((item) => item.taskType === type);
        const raw = sample.length >= 2
            ? median(sample.map((item) => item.actualMinutes / item.estimatedMinutes))
            : globalRatio;
        const confidence = sample.length >= 2
            ? Math.min(0.8, sample.length / (sample.length + 2))
            : Math.min(0.65, trackedCompletions.length / (trackedCompletions.length + 3));
        ratios[type] = boundedRatio(1 + (raw - 1) * confidence);
    });
    const average = (field) => trackedCompletions.length
        ? Math.round(trackedCompletions.reduce((sum, item) => sum + item[field], 0) / trackedCompletions.length)
        : 0;
    return {
        ratios,
        trackedTaskCount: trackedCompletions.length,
        focusSessionCount: recentSessions.length,
        totalFocusMinutes: recentSessions.reduce((sum, session) => sum + Math.max(0, Number(session.minutes) || 0), 0),
        averagePlannedMinutes: average('estimatedMinutes'),
        averageFocusedMinutes: average('actualMinutes'),
    };
}

export function getPersonalizedStudyEstimate(task, baseMinutes, calibration) {
    const base = Math.max(5, Math.min(480, Math.round(Number(baseMinutes) || 25)));
    if (!calibration) return base;
    const ratio = Number(calibration?.ratios?.[normalizeStudyTaskType(task)]) || 1;
    return Math.max(5, Math.min(480, Math.round((base * ratio) / 5) * 5));
}

export async function getStudyCalibrationContext() {
    if (!isStudyCalibrationEnabled()) return null;
    try {
        const snapshot = await getSubscriptionSnapshot();
        if (!hasSubscriptionFeature(snapshot, 'study_plan_calibration')) return null;
        return calculateStudyCalibration();
    } catch {
        return null;
    }
}

function setSettingsMessage(id, message, tone = 'muted') {
    const element = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!element) return;
    element.textContent = message;
    element.className = `text-xs ${tone === 'error' ? 'text-red-600 dark:text-red-400' : tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`;
    element.classList.remove('hidden');
}

export async function refreshStudyCalibrationSettings() {
    if (typeof document === 'undefined') return;
    const input = document.getElementById('studyCalibrationEnabled');
    if (!input) return;
    try {
        const snapshot = await getSubscriptionSnapshot();
        const entitled = hasSubscriptionFeature(snapshot, 'study_plan_calibration');
        input.disabled = !entitled;
        input.checked = entitled && isStudyCalibrationEnabled();
        if (!entitled) {
            setSettingsMessage('studyCalibrationSettingsMsg', 'Personalized plan estimates are included with DueVinci Pro.');
            return;
        }
        const summary = calculateStudyCalibration();
        setSettingsMessage('studyCalibrationSettingsMsg', summary.trackedTaskCount
            ? `Using ${summary.trackedTaskCount} completed study block${summary.trackedTaskCount === 1 ? '' : 's'} from the last 90 days. Turn this off to pause personalization; clear history to remove saved data.`
            : 'After enabling, use a study-plan timer and mark that task done to build your private history.');
    } catch {
        input.disabled = true;
        input.checked = false;
        setSettingsMessage('studyCalibrationSettingsMsg', 'Could not verify Pro access. Try again when you are online.', 'error');
    }
}

export async function saveStudyCalibrationSettingsFromUI() {
    const input = typeof document !== 'undefined' ? document.getElementById('studyCalibrationEnabled') : null;
    if (!input) return;
    const enabled = input.checked;
    try {
        if (enabled) {
            const snapshot = await getSubscriptionSnapshot({ forceRefresh: true });
            if (!hasSubscriptionFeature(snapshot, 'study_plan_calibration')) {
                input.checked = false;
                setSettingsMessage('studyCalibrationSettingsMsg', 'An active DueVinci Pro plan is required for personalized estimates.', 'error');
                return;
            }
        }
        localStorage.setItem(STUDY_CALIBRATION_ENABLED_KEY, String(enabled));
        const synced = await syncPreferencesNow();
        setSettingsMessage('studyCalibrationSettingsMsg', enabled
            ? synced ? 'Personalized estimates are on and synced with your account.' : 'Personalized estimates are on; account sync will retry when connected.'
            : synced ? 'Personalized estimates are paused. Your saved history remains available until you clear it.' : 'Personalized estimates are paused on this device; account sync will retry when connected.', synced ? 'success' : 'muted');
    } catch (error) {
        input.checked = isStudyCalibrationEnabled();
        setSettingsMessage('studyCalibrationSettingsMsg', error?.message || 'Could not save personalized study settings.', 'error');
    }
}

export function clearStudyCalibrationHistory() {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STUDY_CALIBRATION_HISTORY_KEY);
    setSettingsMessage('studyCalibrationSettingsMsg', 'Study calibration history cleared from this device. Account sync will remove the saved copy.', 'success');
    syncPreferencesNow().catch(() => {});
}

if (typeof window !== 'undefined') {
    window.refreshStudyCalibrationSettings = refreshStudyCalibrationSettings;
    window.saveStudyCalibrationSettingsFromUI = saveStudyCalibrationSettingsFromUI;
    window.clearStudyCalibrationHistory = clearStudyCalibrationHistory;
}
