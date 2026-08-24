// --- LOCAL-FIRST DUE DATE & CALENDAR REMINDERS ---
import { supabaseClient } from './config.js';

const ENABLED_KEY = 'duevinci_reminders_enabled';
const OFFSETS_KEY = 'duevinci_reminder_offsets';
const NOTIFIED_KEY = 'duevinci_reminders_notified';
export const VAPID_PUBLIC_KEY = 'BILOB6qV0YeHq3UWchV7RvZC9yUOTtc8DKq4miAsE5ZLy3zsT1Sy2cdk5xEPhQZoMst6SKA9_NdyoBShpJ-F28o';
let reminderTimer = null;

function localDate(value) {
    if (!value) return null;
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function dayDifference(dateValue, now = new Date()) {
    const target = localDate(dateValue);
    if (!target) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
}

export function getReminderPreferences() {
    const rawOffsets = typeof localStorage === 'undefined' ? '0,1,3' : (localStorage.getItem(OFFSETS_KEY) || '0,1,3');
    const offsets = [...new Set(rawOffsets.split(',').map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 30))].sort((a, b) => a - b);
    return {
        enabled: typeof localStorage === 'undefined' ? true : localStorage.getItem(ENABLED_KEY) !== 'false',
        offsets: offsets.length ? offsets : [0, 1, 3],
    };
}

export function saveReminderPreferences({ enabled, offsets }) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
    const cleaned = [...new Set((offsets || []).map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 30))].sort((a, b) => a - b);
    localStorage.setItem(OFFSETS_KEY, (cleaned.length ? cleaned : [0]).join(','));
}

export function collectReminderItems(assignments = [], customEvents = [], courses = [], now = new Date()) {
    const courseNames = new Map(courses.map((course) => [course.id, course.name || course.code || 'Class']));
    const assignmentItems = assignments
        .filter((assignment) => !assignment.is_completed && assignment.due_date)
        .map((assignment) => ({
            id: `assignment:${assignment.id}`,
            kind: 'Assignment',
            title: assignment.title || 'Untitled coursework',
            detail: courseNames.get(assignment.course_id) || 'Coursework',
            date: String(assignment.due_date).slice(0, 10),
            daysUntil: dayDifference(assignment.due_date, now),
        }));
    const eventItems = customEvents
        .filter((event) => event.event_date)
        .map((event) => ({
            id: `event:${event.id}`,
            kind: /study|focus|review/i.test(event.title || '') ? 'Study session' : 'Calendar event',
            title: event.title || 'Untitled event',
            detail: 'Calendar',
            date: String(event.event_date).slice(0, 10),
            daysUntil: dayDifference(event.event_date, now),
        }));
    return [...assignmentItems, ...eventItems]
        .filter((item) => item.daysUntil !== null && item.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title));
}

function relativeDate(daysUntil) {
    if (daysUntil === 0) return 'Due today';
    if (daysUntil === 1) return 'Due tomorrow';
    return `Due in ${daysUntil} days`;
}

function getNotified() {
    try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}'); } catch { return {}; }
}

function saveNotified(entries) {
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(entries)); } catch { /* Notification history is optional. */ }
}

export async function requestReminderPermission() {
    if (typeof Notification === 'undefined') return { granted: false, message: 'Browser notifications are not available on this device.' };
    if (Notification.permission === 'granted') return { granted: true, message: 'Browser reminders are enabled.' };
    if (Notification.permission === 'denied') return { granted: false, message: 'Notifications are blocked in your browser settings.' };
    const permission = await Notification.requestPermission();
    return permission === 'granted'
        ? { granted: true, message: 'Browser reminders are enabled.' }
        : { granted: false, message: 'Notification permission was not granted.' };
}

function urlBase64ToUint8Array(value) {
    const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, '=');
    const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function subscribeToPushNotifications(user = window.currentUser) {
    const permission = await requestReminderPermission();
    if (!permission.granted) return permission;
    if (!user?.id || !navigator.serviceWorker || !window.PushManager) return { granted: false, message: 'Push notifications are not supported by this browser.' };
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    const json = subscription.toJSON();
    const { error } = await supabaseClient.from('push_subscriptions').upsert({
        user_id: user.id, endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return { granted: true, message: 'Background reminders are enabled on this device.' };
}

async function loadReminderData() {
    const [{ data: assignments }, { data: customEvents }, { data: courses }] = await Promise.all([
        supabaseClient.from('assignments').select('*'),
        supabaseClient.from('custom_events').select('*'),
        supabaseClient.from('courses').select('*'),
    ]);
    return { assignments: assignments || [], customEvents: customEvents || [], courses: courses || [] };
}

export async function renderReminderDashboard() {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('dashboardGrid');
    if (!host) return;
    let card = document.getElementById('remindersDashboardCard');
    if (!card) {
        card = document.createElement('section');
        card.id = 'remindersDashboardCard';
        card.className = 'mt-6 bg-zinc-50 dark:bg-brand-800 p-6 rounded-2xl border border-zinc-200 dark:border-brand-700';
        host.appendChild(card);
    }
    const prefs = getReminderPreferences();
    const data = await loadReminderData();
    const items = collectReminderItems(data.assignments, data.customEvents, data.courses).slice(0, 4);
    card.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-4">
            <div><h3 class="text-md font-bold text-zinc-800 dark:text-zinc-200">🔔 Upcoming Reminders</h3><p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">${prefs.enabled ? 'Due dates and calendar plans, kept on this device.' : 'Reminders are paused in Settings.'}</p></div>
            <button type="button" onclick="openSettingsModal(); switchSettingsTab('appearance')" class="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Manage</button>
        </div>
        ${items.length ? `<ul class="space-y-2">${items.map((item) => `<li class="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-brand-900 border border-zinc-200/70 dark:border-brand-700 px-3 py-2.5"><span class="min-w-0"><span class="block text-xs font-bold text-zinc-800 dark:text-white truncate">${item.title}</span><span class="block text-[11px] text-zinc-500 dark:text-zinc-400">${item.kind} · ${item.detail}</span></span><span class="shrink-0 text-[11px] font-bold ${item.daysUntil === 0 ? 'text-rose-500' : 'text-indigo-600 dark:text-indigo-400'}">${relativeDate(item.daysUntil)}</span></li>`).join('')}</ul>` : '<p class="text-sm text-zinc-500 dark:text-zinc-400 py-2">Nothing upcoming. Add a due date or calendar event to see it here.</p>'}
    `;
}

export async function checkDueReminders() {
    const prefs = getReminderPreferences();
    if (!prefs.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const data = await loadReminderData();
    const notified = getNotified();
    const now = new Date();
    const eligible = collectReminderItems(data.assignments, data.customEvents, data.courses, now).filter((item) => prefs.offsets.includes(item.daysUntil));
    eligible.forEach((item) => {
        const key = `${item.id}:${item.date}:${item.daysUntil}`;
        if (notified[key]) return;
        new Notification(`DueVinci: ${relativeDate(item.daysUntil)}`, { body: `${item.title} · ${item.detail}`, tag: key, icon: './assets/icons/icon-192x192.png' });
        notified[key] = Date.now();
    });
    // Keep one month of local notification markers.
    Object.keys(notified).forEach((key) => { if (Date.now() - notified[key] > 31 * 86400000) delete notified[key]; });
    saveNotified(notified);
}

export function startReminderService() {
    if (reminderTimer) clearInterval(reminderTimer);
    renderReminderDashboard().catch(() => {});
    checkDueReminders().catch(() => {});
    reminderTimer = setInterval(() => checkDueReminders().catch(() => {}), 15 * 60 * 1000);
}

export function stopReminderService() {
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = null;
}

export function refreshReminderSettings() {
    if (typeof document === 'undefined') return;
    const prefs = getReminderPreferences();
    const toggle = document.getElementById('remindersEnabled');
    const schedule = document.getElementById('reminderSchedule');
    if (toggle) toggle.checked = prefs.enabled;
    if (schedule) schedule.value = prefs.offsets.join(',');
}

export async function saveReminderSettingsFromUI() {
    const enabled = document.getElementById('remindersEnabled')?.checked !== false;
    const offsets = String(document.getElementById('reminderSchedule')?.value || '0').split(',').map(Number);
    saveReminderPreferences({ enabled, offsets });
    if (window.currentUser?.id && navigator.onLine !== false) {
        await supabaseClient.from('profiles').update({ reminders_enabled: enabled, reminder_offsets: offsets, updated_at: new Date().toISOString() }).eq('user_id', window.currentUser.id);
    }
    const message = document.getElementById('reminderSettingsMsg');
    if (message) { message.textContent = enabled ? 'Reminder schedule saved on this device.' : 'Reminders are paused on this device.'; message.classList.remove('hidden'); }
    startReminderService();
}

if (typeof window !== 'undefined') {
    window.requestReminderPermission = async () => {
        let result;
        try { result = await subscribeToPushNotifications(window.currentUser); } catch (error) { result = { granted: false, message: error?.message || 'Could not enable background reminders.' }; }
        const message = document.getElementById('reminderSettingsMsg');
        if (message) { message.textContent = result.message; message.classList.remove('hidden'); }
    };
    window.saveReminderSettingsFromUI = saveReminderSettingsFromUI;
}
