// --- CANVAS LMS SYNC MODULE ---
// Handles subscription status, Canvas credential verification,
// and course sync within the Settings → Canvas Sync tab.
// This is a fully isolated, optional add-on.
// The free core (local courses, planner, SM-2, timers) is NEVER gated.

import { supabaseClient } from './config.js';

let _canvasSelectedIds = new Set();
let _canvasCourses = [];

const CANVAS_COURSE_COLORS = ['#4f46e5', '#0f766e', '#c2410c', '#be123c', '#7c3aed', '#0369a1'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDomain(raw) {
    let d = raw.trim();
    if (!d.startsWith('http://') && !d.startsWith('https://')) d = `https://${d}`;
    return d.replace(/\/+$/, '');
}

function showConnectorMsg(text, type = 'error') {
    const el = document.getElementById('canvasConnectorMsg');
    if (!el) return;
    el.textContent = text;
    el.className = type === 'success'
        ? 'text-xs rounded-lg px-3 py-2 border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
        : 'text-xs rounded-lg px-3 py-2 border bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300';
    el.classList.remove('hidden');
}

function showSyncModalMsg(text, type = 'error') {
    const el = document.getElementById('canvasSyncModalMsg');
    if (!el) return;
    el.textContent = text;
    el.className = type === 'success'
        ? 'mx-5 mt-4 p-3 rounded-xl text-xs border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
        : 'mx-5 mt-4 p-3 rounded-xl text-xs border bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300';
    el.classList.remove('hidden');
}

function getCurrentUserId() {
    return supabaseClient?.auth?.getUser ? supabaseClient.auth.getUser().then(r => r?.data?.user?.id) : Promise.resolve(null);
}

function withTimeout(promise, message, timeoutMs = 15000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))
    ]);
}

function getCanvasCourseColor(canvasCourseId) {
    const value = String(canvasCourseId).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return CANVAS_COURSE_COLORS[value % CANVAS_COURSE_COLORS.length];
}

export function buildCanvasCoursePayload(canvasCourse, userId, updatedAt = new Date().toISOString()) {
    const name = String(canvasCourse.name || '').trim();
    const code = String(canvasCourse.course_code || name).trim() || name;

    return {
        user_id: userId,
        name,
        code,
        emoji: '📚',
        color: getCanvasCourseColor(canvasCourse.id),
        lms_source_id: String(canvasCourse.id),
        lms_provider: 'canvas',
        updated_at: updatedAt
    };
}

// ─── Subscription State ────────────────────────────────────────────────────────

export async function initCanvasSettingsTab() {
    const badge   = document.getElementById('canvasSubBadge');
    const msg     = document.getElementById('canvasSubMsg');
    const trialBtn = document.getElementById('canvasStartTrialBtn');
    const connectorArea = document.getElementById('canvasConnectorArea');
    const syncTriggerArea = document.getElementById('canvasSyncTriggerArea');

    if (!badge) return;

    // Reset UI
    badge.textContent = 'Loading…';
    msg.textContent   = 'Checking your plan…';
    [trialBtn, connectorArea, syncTriggerArea].forEach(el => el?.classList.add('hidden'));

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('subscription_status, trial_end, canvas_domain, canvas_token')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) throw error;

        const status = profile?.subscription_status || 'inactive';

        // Update badge
        const badgeStyles = {
            active:   'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
            trialing: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
            inactive: 'bg-zinc-200 dark:bg-brand-700 text-zinc-500 dark:text-zinc-400',
        };
        badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        badge.className = `px-2 py-0.5 text-[11px] font-semibold rounded-full ${badgeStyles[status] || badgeStyles.inactive}`;

        if (status === 'inactive') {
            msg.textContent = 'Start a free trial to unlock Canvas LMS course syncing. No credit card required.';
            trialBtn?.classList.remove('hidden');
        } else if (status === 'trialing') {
            const daysLeft = profile.trial_end
                ? Math.max(0, Math.ceil((new Date(profile.trial_end) - new Date()) / 86400000))
                : '?';
            msg.textContent = `Your 30-day trial is active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining.`;
            // Show connector or sync trigger depending on credentials
            _showConnectorOrSync(profile);
        } else if (status === 'active') {
            msg.textContent = 'DueVinci Pro is active. Canvas Sync is enabled.';
            _showConnectorOrSync(profile);
        } else {
            msg.textContent = `Subscription status: ${status}. Contact support if this is unexpected.`;
        }
    } catch (err) {
        badge.textContent = 'Error';
        if (msg) msg.textContent = err.message || 'Unable to load subscription details.';
    }
}

function _showConnectorOrSync(profile) {
    const connectorArea = document.getElementById('canvasConnectorArea');
    const syncTriggerArea = document.getElementById('canvasSyncTriggerArea');
    const domainDisplay = document.getElementById('canvasConnectedDomain');

    if (profile?.canvas_domain && profile?.canvas_token) {
        // Already connected — show sync trigger
        syncTriggerArea?.classList.remove('hidden');
        if (domainDisplay) domainDisplay.textContent = profile.canvas_domain;
        // Pre-fill connector inputs in case user wants to update
        const domainInput = document.getElementById('canvasDomainInput');
        const tokenInput  = document.getElementById('canvasTokenInput');
        if (domainInput) domainInput.value = profile.canvas_domain;
        if (tokenInput)  tokenInput.value  = profile.canvas_token;
    } else {
        // Not connected yet — show connector form
        connectorArea?.classList.remove('hidden');
    }
}

// ─── Trial Handler ─────────────────────────────────────────────────────────────

export async function handleCanvasStartTrial() {
    const btn = document.getElementById('canvasStartTrialBtn');
    const defaultLabel = 'Start 30-Day Free Trial — No Card Required';
    if (btn) { btn.textContent = 'Activating Trial…'; btn.disabled = true; }

    try {
        const { data, error } = await withTimeout(
            supabaseClient.functions.invoke('start-trial'),
            'Starting your trial took too long. Please try again.'
        );
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Unable to start your trial.');

        await withTimeout(
            initCanvasSettingsTab(),
            'Your trial was started, but we could not refresh its status. Please refresh the page.'
        );
    } catch (err) {
        const msg = document.getElementById('canvasSubMsg');
        if (msg) msg.textContent = err.message || 'Failed to start trial. Please try again.';
    } finally {
        // A successful refresh hides the button. If it remains visible, make it usable again.
        if (btn && !btn.classList.contains('hidden')) {
            btn.textContent = defaultLabel;
            btn.disabled = false;
        }
    }
}

// ─── Connector Handler ─────────────────────────────────────────────────────────

export async function handleCanvasConnect() {
    const domainInput = document.getElementById('canvasDomainInput');
    const tokenInput  = document.getElementById('canvasTokenInput');
    const connectBtn  = document.getElementById('canvasConnectBtn');

    const domain = normalizeDomain(domainInput?.value || '');
    const token  = (tokenInput?.value || '').trim();

    const msgEl = document.getElementById('canvasConnectorMsg');
    if (msgEl) msgEl.classList.add('hidden');

    if (!domain || !token) {
        showConnectorMsg('Please provide both your Canvas URL and Access Token.');
        return;
    }

    if (connectBtn) { connectBtn.textContent = 'Verifying…'; connectBtn.disabled = true; }

    try {
        // 1. Verify token against Canvas API
        const res = await fetch(`${domain}/api/v1/users/self/profile`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        });

        if (!res.ok) {
            if (res.status === 401) throw new Error('Authentication failed. Your Canvas token is invalid or expired.');
            throw new Error(`Canvas returned HTTP ${res.status}. Check your instance URL.`);
        }

        const canvasUser = await res.json();

        // 2. Save credentials to Supabase profiles row
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        const { error: updateErr } = await supabaseClient
            .from('profiles')
            .update({ canvas_domain: domain, canvas_token: token, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);

        if (updateErr) throw updateErr;

        const name = canvasUser.name || canvasUser.sortable_name || 'Canvas Student';
        showConnectorMsg(`Connected as ${name}! Refreshing…`, 'success');

        setTimeout(() => initCanvasSettingsTab(), 800);
    } catch (err) {
        showConnectorMsg(err.message || 'Unable to connect to Canvas.');
    } finally {
        if (connectBtn) { connectBtn.textContent = 'Connect Canvas LMS'; connectBtn.disabled = false; }
    }
}

// ─── Disconnect Handler ────────────────────────────────────────────────────────

export async function handleCanvasDisconnect() {
    if (!confirm('Disconnect your Canvas account? Your imported courses will remain, but syncing will be disabled.')) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        await supabaseClient
            .from('profiles')
            .update({ canvas_domain: null, canvas_token: null, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);

        await initCanvasSettingsTab();
    } catch (err) {
        alert('Failed to disconnect: ' + (err.message || 'Unknown error.'));
    }
}

// ─── Sync Modal ────────────────────────────────────────────────────────────────

export async function openCanvasSyncModal() {
    const modal = document.getElementById('canvasSyncModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    _canvasCourses = [];
    _canvasSelectedIds = new Set();

    const list = document.getElementById('canvasCourseList');
    const msgEl = document.getElementById('canvasSyncModalMsg');
    const countEl = document.getElementById('canvasSyncCount');
    if (msgEl) msgEl.classList.add('hidden');
    if (countEl) countEl.textContent = '';

    if (list) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-zinc-400 gap-3">
                <svg class="animate-spin h-5 w-5 text-indigo-500" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span class="text-xs">Fetching active courses from Canvas…</span>
            </div>`;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        const { data: profile, error: profileErr } = await supabaseClient
            .from('profiles')
            .select('canvas_domain, canvas_token')
            .eq('user_id', user.id)
            .maybeSingle();

        if (profileErr) throw profileErr;
        if (!profile?.canvas_domain || !profile?.canvas_token) {
            throw new Error('Canvas credentials not found. Please connect Canvas first.');
        }

        const res = await fetch(
            `${profile.canvas_domain}/api/v1/courses?enrollment_state=active&include[]=term`,
            { headers: { Authorization: `Bearer ${profile.canvas_token}`, Accept: 'application/json' } }
        );

        if (!res.ok) throw new Error(`Canvas returned HTTP ${res.status}.`);

        const raw = await res.json();
        _canvasCourses = raw.filter(c => c.name && c.name.trim().length > 0);
        _canvasSelectedIds = new Set(_canvasCourses.map(c => c.id));

        _renderCourseList();
    } catch (err) {
        showSyncModalMsg(err.message || 'Failed to load Canvas courses.');
        if (list) list.innerHTML = '';
    }
}

function _renderCourseList() {
    const list = document.getElementById('canvasCourseList');
    const countEl = document.getElementById('canvasSyncCount');
    if (!list) return;

    if (_canvasCourses.length === 0) {
        list.innerHTML = '<p class="text-xs text-center text-zinc-400 py-8">No active courses found on Canvas.</p>';
        return;
    }

    const selectAllLabel = _canvasSelectedIds.size === _canvasCourses.length ? 'Deselect All' : 'Select All';

    list.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">${_canvasSelectedIds.size} of ${_canvasCourses.length} selected</span>
            <button type="button" onclick="toggleCanvasSelectAll()" class="text-xs text-indigo-500 hover:text-indigo-400 font-medium" id="canvasSelectAllBtn">${selectAllLabel}</button>
        </div>
        <div class="space-y-2">
            ${_canvasCourses.map(c => `
                <label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${_canvasSelectedIds.has(c.id) ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700' : 'bg-zinc-50 dark:bg-brand-900 border-zinc-200 dark:border-brand-700 hover:bg-zinc-100 dark:hover:bg-brand-800'}">
                    <input type="checkbox" ${_canvasSelectedIds.has(c.id) ? 'checked' : ''} onchange="toggleCanvasCourse(${c.id})" class="w-4 h-4 rounded text-indigo-600 bg-zinc-100 dark:bg-brand-700 border-zinc-300 dark:border-brand-600 focus:ring-indigo-500">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-900 dark:text-white truncate">${c.name}</p>
                        <div class="flex gap-2 text-[11px] text-zinc-400 mt-0.5">
                            ${c.course_code ? `<span>${c.course_code}</span>` : ''}
                            ${c.term?.name ? `<span>•</span><span>${c.term.name}</span>` : ''}
                        </div>
                    </div>
                </label>`).join('')}
        </div>`;

    if (countEl) countEl.textContent = `${_canvasSelectedIds.size} course${_canvasSelectedIds.size === 1 ? '' : 's'} selected`;
}

export function toggleCanvasSelectAll() {
    if (_canvasSelectedIds.size === _canvasCourses.length) {
        _canvasSelectedIds = new Set();
    } else {
        _canvasSelectedIds = new Set(_canvasCourses.map(c => c.id));
    }
    _renderCourseList();
}

export function toggleCanvasCourse(id) {
    if (_canvasSelectedIds.has(id)) {
        _canvasSelectedIds.delete(id);
    } else {
        _canvasSelectedIds.add(id);
    }
    _renderCourseList();
}

export function closeCanvasSyncModal() {
    const modal = document.getElementById('canvasSyncModal');
    if (modal) modal.classList.add('hidden');
}

export async function handleCanvasSyncConfirm() {
    if (_canvasSelectedIds.size === 0) return;

    const confirmBtn = document.getElementById('canvasSyncConfirmBtn');
    if (confirmBtn) { confirmBtn.textContent = 'Syncing…'; confirmBtn.disabled = true; }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        const coursesToSync = _canvasCourses.filter(c => _canvasSelectedIds.has(c.id));

        // Keep Canvas imports compatible with the course fields used throughout the
        // current application, while retaining the LMS identity for future re-syncs.
        const syncedAt = new Date().toISOString();
        const payload = coursesToSync.map(c => buildCanvasCoursePayload(c, user.id, syncedAt));

        const { error } = await supabaseClient
            .from('courses')
            .upsert(payload, { onConflict: 'user_id,lms_source_id' });

        if (error) throw error;

        showSyncModalMsg(`✓ Synced ${coursesToSync.length} course${coursesToSync.length === 1 ? '' : 's'} successfully!`, 'success');
        setTimeout(() => closeCanvasSyncModal(), 1500);
    } catch (err) {
        showSyncModalMsg(err.message || 'Failed to sync courses.');
    } finally {
        if (confirmBtn) { confirmBtn.textContent = 'Sync Selected'; confirmBtn.disabled = false; }
    }
}

// ─── Bind to window for inline HTML handlers ───────────────────────────────────

if (typeof window !== 'undefined') {
    window.initCanvasSettingsTab  = initCanvasSettingsTab;
    window.handleCanvasStartTrial = handleCanvasStartTrial;
    window.handleCanvasConnect    = handleCanvasConnect;
    window.handleCanvasDisconnect = handleCanvasDisconnect;
    window.openCanvasSyncModal    = openCanvasSyncModal;
    window.closeCanvasSyncModal   = closeCanvasSyncModal;
    window.handleCanvasSyncConfirm = handleCanvasSyncConfirm;
    window.toggleCanvasSelectAll  = toggleCanvasSelectAll;
    window.toggleCanvasCourse     = toggleCanvasCourse;
}
