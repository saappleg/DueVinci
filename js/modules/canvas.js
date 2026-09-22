// --- CANVAS LMS SYNC MODULE ---
// Handles subscription status, Canvas credential verification,
// and course sync within the Settings → Canvas Sync tab.
// This is a fully isolated, optional add-on.
// The free core (local courses, planner, SM-2, timers) is NEVER gated.

import { IS_DEVELOPMENT, supabaseClient } from './config.js';
import { escapeHtml, getBasePath } from './utils.js';
import { getSubscriptionSnapshot, hasSubscriptionFeature } from './subscription.js';

let _canvasSelectedIds = new Set();
let _canvasCourses = [];
let _canvasModalTrigger = null;

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

function withTimeout(promise, message, timeoutMs = 15000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))
    ]);
}

async function functionErrorMessage(error, fallback) {
    try {
        const body = await error?.context?.json?.();
        if (body?.error) return body.error;
    } catch (_) {
        // Use the SDK error when the response body is unavailable.
    }
    return error?.message || fallback;
}

function isActiveTrial(profile) {
    const trialEnd = profile?.trialEnd ?? profile?.trial_end;
    return (profile?.status ?? profile?.subscription_status) === 'trialing'
        && Boolean(trialEnd)
        && new Date(trialEnd).getTime() > Date.now();
}

function hasCanvasAccess(profile) {
    return hasSubscriptionFeature(profile, 'canvas_sync');
}

function renderCanvasOnboarding(profile) {
    const area = document.getElementById('canvasOnboardingArea');
    const steps = document.getElementById('canvasOnboardingSteps');
    if (!area || !steps) return;

    const connected = Boolean(profile?.canvasDomain);
    const synced = Boolean(profile?.canvasLastSyncedAt);
    const accountLabel = /duevinci\.test/i.test(profile?.canvasDomain || '') ? 'Sample Canvas account' : 'Canvas account';
    const status = (complete) => complete
        ? '<span class="text-emerald-600 dark:text-emerald-300 font-bold">✓ Done</span>'
        : '<span class="text-indigo-600 dark:text-indigo-300 font-bold">Next</span>';

    steps.innerHTML = `
        <div class="flex items-start justify-between gap-3">
            <div>
                <h3 class="text-sm font-bold text-indigo-950 dark:text-indigo-100">Set up Canvas in three steps</h3>
                <p class="mt-1 text-[11px] text-indigo-800/80 dark:text-indigo-200/80">Connect once, choose what matters, then import dated coursework.</p>
            </div>
            <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">${synced ? 'Complete' : `${connected ? '2' : '1'} of 3`}</span>
        </div>
        <ol class="mt-3 space-y-2 text-xs">
            <li class="flex items-center justify-between gap-3"><span><strong>1.</strong> Connect your Canvas account${connected ? ` <span class="text-zinc-500 dark:text-zinc-400">(${accountLabel})</span>` : ''}</span>${status(connected)}</li>
            <li class="flex items-center justify-between gap-3"><span><strong>2.</strong> Choose the courses to import</span>${status(synced)}</li>
            <li class="flex items-center justify-between gap-3"><span><strong>3.</strong> Import assignments and due dates</span>${status(synced)}</li>
        </ol>
        ${connected && !synced ? '<button type="button" onclick="openCanvasSyncModal()" class="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500">Choose courses and import coursework</button>' : ''}
        ${synced ? `<p class="mt-3 text-[11px] text-emerald-700 dark:text-emerald-300">Your first sync is complete${profile.canvasLastSyncedAt ? ` — last synced ${new Date(profile.canvasLastSyncedAt).toLocaleString()}` : ''}.</p>` : ''}`;
    area.classList.remove('hidden');
}

async function loadCanvasSubscriptionProfile(userId) {
    void userId;
    try {
        return { data: await getSubscriptionSnapshot({ forceRefresh: true }), error: null };
    } catch (error) {
        return { data: null, error };
    }
}

async function requireCanvasAccess() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not signed in.');

    const profile = await getSubscriptionSnapshot();
    if (!hasCanvasAccess(profile)) {
        throw new Error('Canvas LMS Sync requires an active plan or an unexpired free trial.');
    }
    return { user, profile };
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
    const checkoutArea = document.getElementById('canvasCheckoutOptions');
    const manageBillingBtn = document.getElementById('canvasManageBillingBtn');
    const connectorArea = document.getElementById('canvasConnectorArea');
    const syncTriggerArea = document.getElementById('canvasSyncTriggerArea');

    if (!badge) return;
    let profileSnapshot = null;

    // Reset UI
    badge.textContent = 'Loading…';
    msg.textContent   = 'Checking your plan…';
    [trialBtn, checkoutArea, manageBillingBtn, connectorArea, syncTriggerArea, document.getElementById('canvasOnboardingArea')].forEach(el => el?.classList.add('hidden'));

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        const { data: profile, error } = await loadCanvasSubscriptionProfile(user.id);

        if (error) throw error;
        profileSnapshot = profile;

        const storedStatus = profile?.status || 'inactive';
        const status = storedStatus === 'trialing' && !isActiveTrial(profile) ? 'inactive' : storedStatus;

        // Update badge
        const badgeStyles = {
            active:   'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
            trialing: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
            inactive: 'bg-zinc-200 dark:bg-brand-700 text-zinc-500 dark:text-zinc-400',
        };
        badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        badge.className = `px-2 py-0.5 text-[11px] font-semibold rounded-full ${badgeStyles[status] || badgeStyles.inactive}`;

        if (status === 'inactive') {
            if (profile?.trialStartedAt) {
                msg.textContent = 'Your free trial has ended. Choose a subscription to continue using Canvas Sync and the Socratic Study Companion.';
                checkoutArea?.classList.remove('hidden');
            } else {
                msg.textContent = 'Start a free trial to unlock Canvas Sync and the Socratic Study Companion. No credit card required.';
                trialBtn?.classList.remove('hidden');
            }
        } else if (status === 'trialing') {
            const daysLeft = profile.trialEnd
                ? Math.max(0, Math.ceil((new Date(profile.trialEnd) - new Date()) / 86400000))
                : '?';
            msg.textContent = `Your 30-day trial is active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining.`;
            // Let trial users save a payment method once. When a Stripe
            // subscription is already scheduled, show that state instead of a
            // second Checkout button that could look like another free trial.
            if (profile?.hasScheduledSubscription) {
                msg.textContent += ' Your subscription is scheduled to start when the trial ends.';
            } else {
                checkoutArea?.classList.remove('hidden');
            }
            if (profile?.hasBillingAccount) manageBillingBtn?.classList.remove('hidden');
            // Show connector or sync trigger depending on credentials
            if (hasCanvasAccess(profile)) _showConnectorOrSync(profile);
        } else if (status === 'active') {
            msg.textContent = hasCanvasAccess(profile)
                ? 'Your subscription is active. Canvas Sync and the Socratic Study Companion are enabled.'
                : 'Your subscription is active, but Canvas Sync is not included in this plan.';
            const endDate = profile.cancelAt || profile.currentPeriodEnd;
            if (endDate) {
                const formattedDate = new Date(endDate).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric'
                });
                msg.textContent += profile.cancelAtPeriodEnd || profile.cancelAt
                    ? ` Your access ends on ${formattedDate}.`
                    : ` Your plan renews on ${formattedDate}.`;
            }
            if (profile?.hasBillingAccount) manageBillingBtn?.classList.remove('hidden');
            if (hasCanvasAccess(profile)) _showConnectorOrSync(profile);
        } else if (status === 'past_due' || status === 'unpaid') {
            msg.textContent = 'Your subscription is past due, so paid features are paused. Update payment details, or choose a plan if this subscription has already ended.';
            if (profile?.hasBillingAccount) manageBillingBtn?.classList.remove('hidden');
            checkoutArea?.classList.remove('hidden');
        } else if (status === 'incomplete' || status === 'paused') {
            msg.textContent = 'Your subscription needs attention before paid features can be restored. Manage billing, or choose a plan if this subscription has already ended.';
            if (profile?.hasBillingAccount) manageBillingBtn?.classList.remove('hidden');
            checkoutArea?.classList.remove('hidden');
        } else if (status === 'canceled') {
            msg.textContent = 'Your subscription has been canceled. Your planner data stays free; choose a plan whenever you want Canvas Sync and the Socratic Study Companion again.';
            checkoutArea?.classList.remove('hidden');
        } else {
            msg.textContent = 'Your subscription is not active. Choose a plan to continue.';
            checkoutArea?.classList.remove('hidden');
        }
    } catch (err) {
        badge.textContent = 'Error';
        if (msg) msg.textContent = err.message || 'Unable to load subscription details.';
        return null;
    }
    return profileSnapshot;
}

function _showConnectorOrSync(profile) {
    const connectorArea = document.getElementById('canvasConnectorArea');
    const syncTriggerArea = document.getElementById('canvasSyncTriggerArea');
    const domainDisplay = document.getElementById('canvasConnectedDomain');
    const lastSyncedDisplay = document.getElementById('canvasLastSynced');

    renderCanvasOnboarding(profile);

    if (profile?.canvasDomain) {
        // Already connected — show sync trigger
        syncTriggerArea?.classList.remove('hidden');
        if (domainDisplay) domainDisplay.textContent = profile.canvasDomain;
        if (lastSyncedDisplay) {
            lastSyncedDisplay.textContent = profile.canvasLastSyncedAt
                ? `Last synced ${new Date(profile.canvasLastSyncedAt).toLocaleString()}`
                : 'Not synced yet';
        }
        // Pre-fill only the non-secret domain. The Canvas token stays server-side.
        const domainInput = document.getElementById('canvasDomainInput');
        const tokenInput  = document.getElementById('canvasTokenInput');
        if (domainInput) domainInput.value = profile.canvasDomain;
        if (tokenInput) tokenInput.value = '';
    } else {
        // Not connected yet — show connector form
        connectorArea?.classList.remove('hidden');
        document.getElementById('canvasMockConnectBtn')?.classList.toggle('hidden', !IS_DEVELOPMENT);
        document.getElementById('canvasMockConnectHint')?.classList.toggle('hidden', !IS_DEVELOPMENT);
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
        await window.renderTodayWorkspace?.();
    } catch (err) {
        const errorMessage = await functionErrorMessage(err, 'Failed to start trial. Please try again.');
        await initCanvasSettingsTab();
        const msg = document.getElementById('canvasSubMsg');
        if (msg) msg.textContent = errorMessage;
        await window.renderTodayWorkspace?.();
    } finally {
        // A successful refresh hides the button. If it remains visible, make it usable again.
        if (btn && !btn.classList.contains('hidden')) {
            btn.textContent = defaultLabel;
            btn.disabled = false;
        }
    }
}

export async function handleCanvasCheckout(interval) {
    const buttons = [...document.querySelectorAll('[data-canvas-checkout]')];
    const message = document.getElementById('canvasSubMsg');

    buttons.forEach(button => { button.disabled = true; });
    if (message) message.textContent = 'Opening secure checkout…';

    try {
        const returnUrl = new URL(`${getBasePath()}index.html`, window.location.href).href;
        const { data, error } = await withTimeout(
            supabaseClient.functions.invoke('create-checkout-session', {
                body: { interval, returnUrl }
            }),
            'Opening checkout took too long. Please try again.'
        );

        if (error) throw error;
        if (!data?.url) throw new Error(data?.error || 'Unable to create a checkout session.');
        window.location.assign(data.url);
    } catch (err) {
        const errorMessage = await functionErrorMessage(err, 'Unable to open checkout. Please try again.');
        if (/subscription is already scheduled/i.test(errorMessage)) {
            await initCanvasSettingsTab();
        } else if (message) {
            message.textContent = errorMessage;
        }
        buttons.forEach(button => { button.disabled = false; });
    }
}

export async function handleCanvasBillingPortal() {
    const btn = document.getElementById('canvasManageBillingBtn');
    const message = document.getElementById('canvasSubMsg');
    if (btn) { btn.disabled = true; btn.textContent = 'Opening billing portal…'; }
    try {
        const returnUrl = new URL(`${getBasePath()}index.html`, window.location.href).href;
        const { data, error } = await withTimeout(supabaseClient.functions.invoke('create-portal-session', { body: { returnUrl } }), 'Opening billing portal took too long. Please try again.');
        if (error) throw error;
        if (!data?.url) throw new Error(data?.error || 'Unable to open billing portal.');
        window.location.assign(data.url);
    } catch (err) {
        if (message) message.textContent = await functionErrorMessage(err, 'Unable to open billing portal.');
        if (btn) { btn.disabled = false; btn.textContent = 'Manage subscription'; }
    }
}

export async function handleCanvasCheckoutReturn() {
    if (typeof window === 'undefined' || !window.location?.search) return;
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get('canvas_checkout');
    const returnedFromPortal = url.searchParams.get('billing_portal') === 'return';
    if (!['success', 'canceled'].includes(outcome) && !returnedFromPortal) return;

    // The session ID is intentionally discarded; the Stripe webhook remains
    // the authority for subscription state and feature access.
    url.searchParams.delete('canvas_checkout');
    url.searchParams.delete('session_id');
    url.searchParams.delete('billing_portal');
    const query = url.searchParams.toString();
    window.history.replaceState(window.history.state, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);

    if (outcome === 'canceled') {
        window.openSettingsModal?.();
        window.switchSettingsTab?.('canvas', { refresh: false });
        await initCanvasSettingsTab();
        const message = document.getElementById('canvasSubMsg');
        if (message) message.textContent = 'Checkout was canceled. No subscription changes were made.';
        return;
    }

    window.openSettingsModal?.();
    window.switchSettingsTab?.('canvas', { refresh: false });
    if (returnedFromPortal) {
        const message = document.getElementById('canvasSubMsg');
        if (message) message.textContent = 'Refreshing your billing details…';
        const snapshot = await initCanvasSettingsTab();
        if (message && snapshot) {
            const status = snapshot?.status || 'unknown';
            message.textContent = hasSubscriptionFeature(snapshot, 'canvas_sync')
                ? 'Billing details refreshed. Your paid features are active.'
                : `Billing details refreshed. Current subscription status: ${status.replaceAll('_', ' ')}. Paid features are currently unavailable.`;
        } else if (message) {
            message.textContent = 'We could not confirm your billing details. Refresh this page to try again.';
        }
        await window.renderTodayWorkspace?.();
        return;
    }
    const message = document.getElementById('canvasSubMsg');
    if (message) message.textContent = 'Checkout complete. Confirming your subscription…';

    let snapshot = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        snapshot = await initCanvasSettingsTab();
        if (hasSubscriptionFeature(snapshot, 'canvas_sync')) break;
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const currentMessage = document.getElementById('canvasSubMsg');
    if (currentMessage) {
        currentMessage.textContent = hasSubscriptionFeature(snapshot, 'canvas_sync')
            ? snapshot?.status === 'trialing'
                ? 'Your trial is active. Canvas Sync and the Socratic Study Companion are enabled.'
                : 'Your subscription is active. Canvas Sync and the Socratic Study Companion are enabled.'
            : 'Checkout is complete. Stripe is still confirming your subscription; refresh this page in a moment if Pro access does not appear.';
    }
    await window.renderTodayWorkspace?.();
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
        const { data, error } = await withTimeout(supabaseClient.functions.invoke('canvas-connect', { body: { canvasUrl: domain, canvasToken: token } }), 'Connecting to Canvas took too long. Please try again.');
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Unable to connect Canvas.');
        const name = data.name || 'Canvas Student';
        showConnectorMsg(`Connected as ${name}! Refreshing…`, 'success');

        setTimeout(() => initCanvasSettingsTab(), 800);
    } catch (err) {
        showConnectorMsg(err.message || 'Unable to connect to Canvas.');
    } finally {
        if (connectBtn) { connectBtn.textContent = 'Connect Canvas LMS'; connectBtn.disabled = false; }
    }
}

// This uses the Dev Supabase project's server-side fixture. It is never shown
// outside a loopback development host and the fixture is disabled in Production.
export async function handleCanvasConnectMock() {
    const connectBtn = document.getElementById('canvasMockConnectBtn');
    if (connectBtn) { connectBtn.textContent = 'Connecting sample account…'; connectBtn.disabled = true; }
    try {
        const { data, error } = await withTimeout(
            supabaseClient.functions.invoke('canvas-connect', { body: { useMock: true } }),
            'Connecting the sample Canvas account took too long. Please try again.'
        );
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Unable to connect the sample Canvas account.');
        showConnectorMsg('Sample Canvas account connected! Refreshing…', 'success');
        setTimeout(() => initCanvasSettingsTab(), 800);
    } catch (err) {
        showConnectorMsg(err.message || 'Unable to connect the sample Canvas account.');
    } finally {
        if (connectBtn) { connectBtn.textContent = 'Try the guided sample setup (Dev only)'; connectBtn.disabled = false; }
    }
}

// ─── Disconnect Handler ────────────────────────────────────────────────────────

export async function handleCanvasDisconnect() {
    if (!confirm('Disconnect your Canvas account? Your imported courses will remain, but syncing will be disabled.')) return;

    try {
        const { error } = await supabaseClient.functions.invoke('canvas-disconnect');
        if (error) throw error;

        await initCanvasSettingsTab();
    } catch (err) {
        alert('Failed to disconnect: ' + (err.message || 'Unknown error.'));
    }
}

// ─── Sync Modal ────────────────────────────────────────────────────────────────

export async function openCanvasSyncModal() {
    const modal = document.getElementById('canvasSyncModal');
    if (!modal) return;
    if (modal.classList.contains('hidden')) _canvasModalTrigger = document.activeElement;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    if (modal.dataset.a11yBound !== 'true') {
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeCanvasSyncModal();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
                .filter((element) => !element.disabled && element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        modal.dataset.a11yBound = 'true';
    }
    const focusClose = () => modal.querySelector('[data-modal-close]')?.focus();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusClose);
    else focusClose();

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
                <span class="text-xs">Fetching active Canvas coursework…</span>
            </div>`;
    }

    try {
        const { data, error } = await withTimeout(supabaseClient.functions.invoke('canvas-courses'), 'Loading Canvas courses took too long. Please try again.');
        if (error) throw error;
        if (!data?.courses) throw new Error(data?.error || 'Unable to load Canvas courses.');
        _canvasCourses = data.courses;
        _canvasSelectedIds = new Set(_canvasCourses.map(c => String(c.id)));

        _renderCourseList();
    } catch (err) {
        showSyncModalMsg(await functionErrorMessage(err, 'Failed to load Canvas courses.'));
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
            ${_canvasCourses.map(c => {
                const id = String(c.id ?? '');
                const selected = _canvasSelectedIds.has(id);
                return `
                <label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700' : 'bg-zinc-50 dark:bg-brand-900 border-zinc-200 dark:border-brand-700 hover:bg-zinc-100 dark:hover:bg-brand-800'}">
                    <input type="checkbox" data-canvas-course-id="${escapeHtml(id)}" ${selected ? 'checked' : ''} class="w-4 h-4 rounded text-indigo-600 bg-zinc-100 dark:bg-brand-700 border-zinc-300 dark:border-brand-600 focus:ring-indigo-500">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-900 dark:text-white truncate">${escapeHtml(c.name)}</p>
                        <div class="flex gap-2 text-[11px] text-zinc-400 mt-0.5">
                            ${c.course_code ? `<span>${escapeHtml(c.course_code)}</span>` : ''}
                            ${c.term?.name ? `<span>•</span><span>${escapeHtml(c.term.name)}</span>` : ''}
                        </div>
                    </div>
                </label>`;
            }).join('')}
        </div>`;

    list.querySelectorAll('[data-canvas-course-id]').forEach((input) => {
        input.addEventListener('change', () => toggleCanvasCourse(input.dataset.canvasCourseId));
    });

    if (countEl) countEl.textContent = `${_canvasSelectedIds.size} course${_canvasSelectedIds.size === 1 ? '' : 's'} selected`;
}

export function toggleCanvasSelectAll() {
    if (_canvasSelectedIds.size === _canvasCourses.length) {
        _canvasSelectedIds = new Set();
    } else {
        _canvasSelectedIds = new Set(_canvasCourses.map(c => String(c.id)));
    }
    _renderCourseList();
}

export function toggleCanvasCourse(id) {
    id = String(id);
    if (_canvasSelectedIds.has(id)) {
        _canvasSelectedIds.delete(id);
    } else {
        _canvasSelectedIds.add(id);
    }
    _renderCourseList();
}

export function closeCanvasSyncModal() {
    const modal = document.getElementById('canvasSyncModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    if (_canvasModalTrigger && typeof _canvasModalTrigger.focus === 'function') _canvasModalTrigger.focus();
    _canvasModalTrigger = null;
}

export async function handleCanvasSyncConfirm() {
    if (_canvasSelectedIds.size === 0) return;

    const confirmBtn = document.getElementById('canvasSyncConfirmBtn');
    if (confirmBtn) { confirmBtn.textContent = 'Syncing…'; confirmBtn.disabled = true; }

    try {
        const { data, error } = await withTimeout(supabaseClient.functions.invoke('canvas-sync', { body: { selectedIds: [..._canvasSelectedIds] } }), 'Syncing Canvas courses took too long. Please try again.');
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Unable to sync Canvas courses.');
        const courseCount = data.syncedCourses ?? data.synced ?? 0;
        const assignmentCount = data.syncedAssignments ?? 0;
        const lastSyncedDisplay = document.getElementById('canvasLastSynced');
        if (lastSyncedDisplay && data.syncedAt) lastSyncedDisplay.textContent = `Last synced ${new Date(data.syncedAt).toLocaleString()}`;
        showSyncModalMsg(`✓ Synced ${courseCount} course${courseCount === 1 ? '' : 's'} and ${assignmentCount} assignment${assignmentCount === 1 ? '' : 's'} successfully!`, 'success');
        setTimeout(async () => {
            closeCanvasSyncModal();
            await initCanvasSettingsTab();
        }, 1500);
    } catch (err) {
        showSyncModalMsg(await functionErrorMessage(err, 'Failed to sync Canvas coursework.'));
    } finally {
        if (confirmBtn) { confirmBtn.textContent = 'Sync selected'; confirmBtn.disabled = false; }
    }
}

// ─── Bind to window for inline HTML handlers ───────────────────────────────────

if (typeof window !== 'undefined') {
    window.initCanvasSettingsTab  = initCanvasSettingsTab;
    window.handleCanvasStartTrial = handleCanvasStartTrial;
    window.handleCanvasCheckout = handleCanvasCheckout;
    window.handleCanvasBillingPortal = handleCanvasBillingPortal;
    window.handleCanvasCheckoutReturn = handleCanvasCheckoutReturn;
    window.handleCanvasConnect    = handleCanvasConnect;
    window.handleCanvasConnectMock = handleCanvasConnectMock;
    window.handleCanvasDisconnect = handleCanvasDisconnect;
    window.openCanvasSyncModal    = openCanvasSyncModal;
    window.closeCanvasSyncModal   = closeCanvasSyncModal;
    window.handleCanvasSyncConfirm = handleCanvasSyncConfirm;
    window.toggleCanvasSelectAll  = toggleCanvasSelectAll;
    window.toggleCanvasCourse     = toggleCanvasCourse;
}
