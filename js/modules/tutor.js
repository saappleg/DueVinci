import { supabaseClient } from './config.js';
import { escapeHtml } from './utils.js';

let conversation = [];

export function isTutorAccessActive(profile, now = Date.now()) {
    return profile?.subscription_status === 'active'
        || (profile?.subscription_status === 'trialing' && !!profile.trial_end && new Date(profile.trial_end).getTime() > now);
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
    const [{ data: profile, error: profileError }, { data: courses, error: courseError }] = await Promise.all([
        supabaseClient.from('profiles').select('subscription_status, trial_end').eq('user_id', user.id).maybeSingle(),
        supabaseClient.from('courses').select('id, name, code').order('name'),
    ]);
    if (profileError || courseError) return;
    if (!isTutorAccessActive(profile)) {
        locked?.classList.remove('hidden');
        workspace?.classList.add('hidden');
        return;
    }
    locked?.classList.add('hidden');
    workspace?.classList.remove('hidden');
    if (courseSelect) {
        courseSelect.innerHTML = '<option value="">General study help</option>' + (courses || []).map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.code || course.name)}${course.code ? ` · ${escapeHtml(course.name)}` : ''}</option>`).join('');
    }
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
    } catch (error) {
        conversation.pop();
        addMessage('model', error?.message || 'Tutor unavailable. Please try again.');
    } finally {
        if (send) { send.disabled = false; send.textContent = 'Send'; }
        input.focus();
    }
}

if (typeof window !== 'undefined') {
    window.loadTutorPage = loadTutorPage;
    window.submitTutorMessage = submitTutorMessage;
}
