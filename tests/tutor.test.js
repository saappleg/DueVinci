import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), snapshot: vi.fn(), courses: vi.fn(), invoke: vi.fn() }));
vi.mock('../js/modules/config.js', () => ({ supabaseClient: {
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ order: mocks.courses }) }),
    functions: { invoke: mocks.invoke },
} }));
vi.mock('../js/modules/subscription.js', async (importOriginal) => ({
    ...await importOriginal(), getSubscriptionSnapshot: mocks.snapshot,
}));
import { isTutorAccessActive, loadTutorPage, submitTutorMessage } from '../js/modules/tutor.js';

describe('Socratic Tutor entitlement UI', () => {
    const now = Date.parse('2026-08-24T12:00:00Z');

    it('allows active subscriptions and unexpired trials', () => {
        expect(isTutorAccessActive({ subscription_status: 'active' }, now)).toBe(true);
        expect(isTutorAccessActive({ subscription_status: 'trialing', trial_end: '2026-08-25T12:00:00Z' }, now)).toBe(true);
    });

    it('keeps inactive and expired subscriptions locked', () => {
        expect(isTutorAccessActive({ subscription_status: 'inactive' }, now)).toBe(false);
        expect(isTutorAccessActive({ subscription_status: 'trialing', trial_end: '2026-08-23T12:00:00Z' }, now)).toBe(false);
    });
});

describe('Study Companion loading and announcements', () => {
    let elements;
    function element() {
        const classes = new Set(['hidden']);
        return { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
            children: [], textContent: '', value: '', disabled: false, focus: vi.fn(),
            appendChild(child) { this.children.push(child); },
        };
    }
    beforeEach(() => {
        vi.clearAllMocks();
        elements = Object.fromEntries(['tutorLoading', 'tutorLoadError', 'tutorPaywall', 'tutorWorkspace', 'tutorCourse', 'tutorMessages', 'tutorUsageStatus', 'tutorInput', 'tutorSend', 'tutorReplyStatus'].map((id) => [id, element()]));
        vi.stubGlobal('document', { getElementById: (id) => elements[id], createElement: element });
        mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
        mocks.snapshot.mockResolvedValue({ subscription_status: 'active' });
        mocks.courses.mockResolvedValue({ data: [], error: null });
        mocks.invoke.mockResolvedValue({ data: {}, error: null });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('shows loading while authentication is pending and clears it when ready', async () => {
        let resolveUser;
        mocks.getUser.mockImplementation(() => new Promise((resolve) => { resolveUser = resolve; }));
        elements.tutorWorkspace.classList.remove('hidden');
        const loading = loadTutorPage();
        expect(elements.tutorLoading.classList.contains('hidden')).toBe(false);
        expect(elements.tutorWorkspace.classList.contains('hidden')).toBe(true);
        resolveUser({ data: { user: { id: 'user-1' } }, error: null });
        await loading;
        expect(elements.tutorLoading.classList.contains('hidden')).toBe(true);
        expect(elements.tutorWorkspace.classList.contains('hidden')).toBe(false);
    });

    it.each(['auth', 'subscription', 'courses'])('shows a retry state on a rejected %s request', async (request) => {
        if (request === 'auth') mocks.getUser.mockRejectedValue(new Error('offline'));
        if (request === 'subscription') mocks.snapshot.mockRejectedValue(new Error('offline'));
        if (request === 'courses') mocks.courses.mockRejectedValue(new Error('offline'));
        await expect(loadTutorPage()).resolves.toBeUndefined();
        expect(elements.tutorLoading.classList.contains('hidden')).toBe(true);
        expect(elements.tutorLoadError.classList.contains('hidden')).toBe(false);
        expect(elements.tutorWorkspace.classList.contains('hidden')).toBe(true);
    });

    it('clears loading for locked and signed-out sessions', async () => {
        mocks.snapshot.mockResolvedValue({ subscription_status: 'inactive' });
        await loadTutorPage();
        expect(elements.tutorPaywall.classList.contains('hidden')).toBe(false);
        expect(elements.tutorLoading.classList.contains('hidden')).toBe(true);
        mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
        await loadTutorPage();
        expect(elements.tutorLoading.classList.contains('hidden')).toBe(true);
        expect(elements.tutorWorkspace.classList.contains('hidden')).toBe(true);
    });

    it('announces pending replies and prevents a second concurrent submission', async () => {
        let resolveReply;
        mocks.invoke.mockImplementation(() => new Promise((resolve) => { resolveReply = resolve; }));
        elements.tutorInput.value = 'Explain a fictional study topic';
        const reply = submitTutorMessage();
        expect(elements.tutorReplyStatus.textContent).toBe('Study Companion is thinking.');
        elements.tutorInput.value = 'A second message';
        await submitTutorMessage();
        expect(mocks.invoke).toHaveBeenCalledOnce();
        resolveReply({ data: { reply: 'What do you already know?' }, error: null });
        await reply;
        expect(elements.tutorReplyStatus.textContent).toBe('');
        expect(elements.tutorSend.disabled).toBe(false);
        expect(elements.tutorInput.focus).toHaveBeenCalled();
    });

    it('labels the composer and exposes conversation additions as a polite log', () => {
        const html = readFileSync(new URL('../tutor/index.html', import.meta.url), 'utf8');
        expect(html).toMatch(/id="tutorMessages"[^>]*role="log"[^>]*aria-live="polite"/);
        expect(html).toMatch(/id="tutorInput"[^>]*aria-label="Your study question"/);
        expect(html).toMatch(/id="tutorLoading"[^>]*role="status"/);
    });
});
