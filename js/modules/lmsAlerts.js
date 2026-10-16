import { getSubscriptionSnapshot, hasSubscriptionFeature } from './subscription.js';
import { subscribeToPushNotifications } from './reminders.js';
import { syncPreferencesNow } from './preferences.js';

export const LMS_CHANGE_ALERTS_KEY = 'duevinci_lms_change_alerts_enabled';

function showMessage(message, tone = 'muted') {
    const element = typeof document !== 'undefined' ? document.getElementById('lmsChangeAlertsMsg') : null;
    if (!element) return;
    element.textContent = message;
    element.className = `text-xs ${tone === 'error' ? 'text-red-600 dark:text-red-400' : tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`;
    element.classList.remove('hidden');
}

export function areLmsChangeAlertsEnabled() {
    return typeof localStorage !== 'undefined' && localStorage.getItem(LMS_CHANGE_ALERTS_KEY) === 'true';
}

export async function refreshLmsChangeAlertSettings() {
    if (typeof document === 'undefined') return;
    const input = document.getElementById('lmsChangeAlertsEnabled');
    if (!input) return;
    try {
        const snapshot = await getSubscriptionSnapshot();
        const entitled = hasSubscriptionFeature(snapshot, 'lms_change_alerts');
        input.disabled = !entitled;
        input.checked = entitled && areLmsChangeAlertsEnabled();
        showMessage(entitled
            ? 'Alerts are sent after a Canvas sync. Enable browser alerts on each device where you want to receive them.'
            : 'Canvas assignment change alerts are included with DueVinci Pro.');
    } catch {
        input.disabled = true;
        input.checked = false;
        showMessage('Could not verify Pro access. Try again when you are online.', 'error');
    }
}

export async function saveLmsChangeAlertSettingsFromUI() {
    const input = typeof document !== 'undefined' ? document.getElementById('lmsChangeAlertsEnabled') : null;
    if (!input) return;
    const enabled = input.checked;
    try {
        if (enabled) {
            const snapshot = await getSubscriptionSnapshot({ forceRefresh: true });
            if (!hasSubscriptionFeature(snapshot, 'lms_change_alerts')) {
                input.checked = false;
                showMessage('An active DueVinci Pro plan is required for Canvas change alerts.', 'error');
                return;
            }
            const push = await subscribeToPushNotifications(typeof window !== 'undefined' ? window.currentUser : null);
            if (!push.granted) {
                input.checked = false;
                showMessage(push.message || 'Enable browser alerts before turning on Canvas changes.', 'error');
                return;
            }
        }
        localStorage.setItem(LMS_CHANGE_ALERTS_KEY, String(enabled));
        const synced = await syncPreferencesNow();
        showMessage(enabled
            ? synced ? 'Canvas change alerts are on and synced with your account.' : 'Canvas change alerts are on; account sync will retry when connected.'
            : synced ? 'Canvas change alerts are off.' : 'Canvas change alerts are off on this device; account sync will retry when connected.', synced ? 'success' : 'muted');
    } catch (error) {
        input.checked = areLmsChangeAlertsEnabled();
        showMessage(error?.message || 'Could not save Canvas change alerts.', 'error');
    }
}

if (typeof window !== 'undefined') {
    window.refreshLmsChangeAlertSettings = refreshLmsChangeAlertSettings;
    window.saveLmsChangeAlertSettingsFromUI = saveLmsChangeAlertSettingsFromUI;
}
