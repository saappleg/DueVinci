import { supabaseClient } from './config.js';
import { escapeHtml } from './utils.js';
import { getSubscriptionSnapshot, hasSubscriptionFeature } from './subscription.js';

let conversation = [];

export function isTutorAccessActive(profile, now = Date.now()) {
    if (profile?.features) return hasSubscriptionFeature(profile, 'socratic_tutor');
    return profile?.subscription_status === 'active'
        || (profile?.subscription_status === 'trialing' && !!profile.trial_end && new Date(profile.trial_end).getTime() > now);
}

function renderTutorUsage(usage) {
    const status = document.getElementById('tutorUsageStatus');
    if (!status || !usage) return;
    status.textContent = `Tutor use: ${usage.usedThisMonth} of ${usage.monthlyLimit} this month · ${usage.usedToday} of ${usage.dailyLimit} today (UTC)`;
}

async function loadTutorUsage() {
    const { data, error } = await supabaseClient.functions.invoke('tutor', { body: { action: 'usage' } });
    if (error) throw error;
    renderTutorUsage(data?.usage);
}

async function tutorErrorMessage(error) {
    try {
        const body = await error?.context?.clone?.().json();
        if (body?.error) return body.error;
    } catch { /* Fall back to the SDK message below. */ }
    return error?.message || 'Tutor unavailable. Please try again.';
}

function addMessage(role, text) {
    const feed = document.getElementById('tutorMessages');
    if (!feed) return;
    const message = document.createElement('article');
    message.className = `max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${role === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'mr-auto bg-zinc-100 text-zinc-800 dark:bg-brand-800 dark:text-zinc-100'}`;
    message.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    feed.appendChild(message);
    feed.scrollTop = feed.scrollHeight;
}

export async function loadTutorPage() {
    const locked = document.getElementById('tutorPaywall');
    const workspace = document.getElementById('tutorWorkspace');
    const courseSelect = document.getElementById('tutorCourse');
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const [{ data: snapshot, error: subscriptionError }, { data: courses, error: courseError }] = await Promise.all([
        getSubscriptionSnapshot({ forceRefresh: true }).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
        supabaseClient.from('courses').select('id, name, code').order('name'),
    ]);
    if (courseError) return;
    if (subscriptionError || !isTutorAccessActive(snapshot)) {
        locked?.classList.remove('hidden');
        workspace?.classList.add('hidden');
        return;
    }
    locked?.classList.add('hidden');
    workspace?.classList.remove('hidden');
    if (courseSelect) {
        courseSelect.innerHTML = '<option value="">General study help</option>' + (courses || []).map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.code || course.name)}${course.code ? ` · ${escapeHtml(course.name)}` : ''}</option>`).join('');
    }
    try { await loadTutorUsage(); } catch { renderTutorUsage(null); }
    if (!conversation.length) addMessage('model', 'Pick a course and tell me what you are working through. I’ll guide you with questions and small steps.');
}

export async function submitTutorMessage() {
    const input = document.getElementById('tutorInput');
    const send = document.getElementById('tutorSend');
    const courseSelect = document.getElementById('tutorCourse');
    const message = String(input?.value || '').trim();
    if (!message || !input) return;
    input.value = '';
    addMessage('user', message);
    conversation.push({ role: 'user', text: message });
    if (send) { send.disabled = true; send.textContent = 'Thinking…'; }
    try {
        const { data, error } = await supabaseClient.functions.invoke('tutor', {
            body: { message, courseId: courseSelect?.value || null, history: conversation.slice(0, -1) },
        });
        if (error) throw error;
        if (!data?.reply) throw new Error(data?.error || 'Tutor unavailable.');
        conversation.push({ role: 'model', text: data.reply });
        addMessage('model', data.reply);
        renderTutorUsage(data.usage);
    } catch (error) {
        try {
            const body = await error?.context?.clone?.().json();
            renderTutorUsage(body?.usage);
        } catch { /* The usage label updates after the next successful reply. */ }
        conversation.pop();
        addMessage('model', await tutorErrorMessage(error));
    } finally {
        if (send) { send.disabled = false; send.textContent = 'Send'; }
        input.focus();
    }
}

if (typeof window !== 'undefined') {
    window.loadTutorPage = loadTutorPage;
    window.submitTutorMessage = submitTutorMessage;
}
