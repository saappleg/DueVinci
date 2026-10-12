import { supabaseClient } from './config.js';
import { hasSubscriptionFeature } from './subscription.js';

let brightspaceStatus = null;

function setMessage(message, tone = 'muted') {
    const element = document.getElementById('brightspaceSyncMessage');
    if (!element) return;
    const toneClasses = {
        muted: 'text-zinc-500 dark:text-zinc-400',
        success: 'text-emerald-700 dark:text-emerald-300',
        error: 'text-red-600 dark:text-red-300',
    };
    element.textContent = message;
    element.className = `text-xs ${toneClasses[tone] || toneClasses.muted}`;
    element.classList.remove('hidden');
}

function renderStatus() {
    const connectArea = document.getElementById('brightspaceConnectArea');
    const connectedArea = document.getElementById('brightspaceConnectedArea');
    if (!connectArea || !connectedArea) return;
    const enabled = Boolean(brightspaceStatus?.featureEnabled);
    const connected = Boolean(brightspaceStatus?.connected);
    connectArea.classList.toggle('hidden', connected || !enabled);
    connectedArea.classList.toggle('hidden', !connected);
    document.getElementById('brightspaceSyncButton')?.classList.toggle('hidden', !enabled);
    const lastSynced = document.getElementById('brightspaceLastSynced');
    if (lastSynced) {
        lastSynced.textContent = !enabled
            ? 'Pro access is required to sync this feed. You can disconnect it here.'
            : brightspaceStatus?.lastSyncedAt
                ? `Last synced ${new Date(brightspaceStatus.lastSyncedAt).toLocaleString()} · ${brightspaceStatus.lastSyncCount || 0} calendar item${brightspaceStatus.lastSyncCount === 1 ? '' : 's'}`
                : 'Connected, but not synced yet.';
    }
}

async function callBrightspace(action, extra = {}) {
    const { data, error } = await supabaseClient.functions.invoke('brightspace-calendar', {
        body: { action, ...extra },
    });
    if (error) {
        let message = error.message || 'Brightspace calendar sync failed.';
        try {
            const body = await error.context?.json?.();
            if (body?.error) message = body.error;
        } catch { /* The SDK error message is sufficient when no response body is available. */ }
        throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
}

export async function initBrightspaceSettings(snapshot) {
    const area = document.getElementById('brightspaceSyncArea');
    if (!area) return;
    const featureEnabled = hasSubscriptionFeature(snapshot, 'brightspace_sync');
    brightspaceStatus = { ...(brightspaceStatus || {}), featureEnabled };
    setMessage('Checking your SNHU connection…');
    try {
        const status = await callBrightspace('status');
        brightspaceStatus = { ...status, featureEnabled: featureEnabled && status.featureEnabled === true };
        area.classList.toggle('hidden', !brightspaceStatus.featureEnabled && !status.connected);
        renderStatus();
        setMessage(status.connected
            ? brightspaceStatus.featureEnabled ? 'SNHU Brightspace is connected.' : 'Your SNHU feed is saved. Pro access is required to sync it again.'
            : featureEnabled ? 'Connect your SNHU course calendar to DueVinci.' : '');
    } catch (error) {
        area.classList.toggle('hidden', !featureEnabled);
        brightspaceStatus = { connected: false, featureEnabled };
        renderStatus();
        setMessage(error.message || 'Could not check the SNHU connection.', 'error');
    }
}

export async function connectBrightspaceCalendar() {
    const input = document.getElementById('brightspaceFeedUrlInput');
    const button = document.getElementById('brightspaceConnectButton');
    const feedUrl = String(input?.value || '').trim();
    if (!feedUrl) {
        setMessage('Paste the private calendar link copied from SNHU Brightspace.', 'error');
        input?.focus();
        return;
    }
    if (input) input.value = '';
    if (button) { button.disabled = true; button.textContent = 'Connecting…'; }
    setMessage('Validating your SNHU feed and syncing calendar items…');
    try {
        brightspaceStatus = await callBrightspace('connect', { feedUrl });
        brightspaceStatus.featureEnabled = true;
        renderStatus();
        setMessage(`Connected to SNHU Brightspace. Synced ${brightspaceStatus.lastSyncCount || 0} calendar item${brightspaceStatus.lastSyncCount === 1 ? '' : 's'}.`, 'success');
        await window.loadCalendarCourses?.();
    } catch (error) {
        setMessage(error.message || 'Could not connect the SNHU calendar.', 'error');
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Connect and sync SNHU calendar'; }
    }
}

export async function syncBrightspaceCalendar() {
    const button = document.getElementById('brightspaceSyncButton');
    if (button) { button.disabled = true; button.textContent = 'Syncing…'; }
    setMessage('Syncing the latest SNHU calendar items…');
    try {
        brightspaceStatus = await callBrightspace('sync');
        brightspaceStatus.featureEnabled = true;
        renderStatus();
        setMessage(`SNHU calendar synced. Updated ${brightspaceStatus.lastSyncCount || 0} calendar item${brightspaceStatus.lastSyncCount === 1 ? '' : 's'}.`, 'success');
        await window.loadCalendarCourses?.();
    } catch (error) {
        setMessage(error.message || 'Could not sync the SNHU calendar.', 'error');
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Sync now'; }
    }
}

export async function disconnectBrightspaceCalendar() {
    if (!window.confirm('Disconnect SNHU Brightspace? Previously imported calendar entries will remain in DueVinci.')) return;
    const button = document.getElementById('brightspaceDisconnectButton');
    if (button) button.disabled = true;
    setMessage('Disconnecting SNHU Brightspace…');
    try {
        await callBrightspace('disconnect');
        brightspaceStatus = { connected: false, featureEnabled: Boolean(brightspaceStatus?.featureEnabled), lastSyncedAt: null, lastSyncCount: 0 };
        document.getElementById('brightspaceSyncArea')?.classList.toggle('hidden', !brightspaceStatus.featureEnabled);
        renderStatus();
        setMessage('SNHU Brightspace disconnected. Previously imported calendar entries remain in your calendar.', 'success');
    } catch (error) {
        setMessage(error.message || 'Could not disconnect SNHU Brightspace.', 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

if (typeof window !== 'undefined') {
    window.initBrightspaceSettings = initBrightspaceSettings;
    window.connectBrightspaceCalendar = connectBrightspaceCalendar;
    window.syncBrightspaceCalendar = syncBrightspaceCalendar;
    window.disconnectBrightspaceCalendar = disconnectBrightspaceCalendar;
}
