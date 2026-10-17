import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), snapshot: vi.fn(), courses: vi.fn(), invoke: vi.fn() }));
vi.mock('../supabase/functions/_shared/canvas.ts', () => ({
    corsHeaders: {},
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    requireFeature: vi.fn(),
}));
vi.mock('../js/modules/config.js', () => ({ supabaseClient: {
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ order: mocks.courses }) }),
    functions: { invoke: mocks.invoke },
} }));
vi.mock('../js/modules/subscription.js', async (importOriginal) => ({
    ...await importOriginal(), getSubscriptionSnapshot: mocks.snapshot,
}));
import { isTutorAccessActive, loadTutorPage, submitTutorMessage } from '../js/modules/tutor.js';
import { parseTutorResponse, tutorSourceStatus, verifiedCitations } from '../supabase/functions/tutor/index.ts';

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

describe('Tutor source citation validation', () => {
    const sources = [{ id: 'class_notes', label: 'Class notes', text: 'Mitosis produces two genetically identical daughter cells.' }];

    it('keeps only excerpts that match selected course material and returns source text casing', () => {
        expect(verifiedCitations([
            { source_id: 'class_notes', excerpt: 'mitosis produces two genetically identical daughter cells.' },
            { source_id: 'another_course', excerpt: 'An unsupported statement from another course.' },
            { source_id: 'class_notes', excerpt: 'This sentence is not in the selected course notes.' },
        ], sources)).toEqual([{
            sourceId: 'class_notes', label: 'Class notes', excerpt: 'Mitosis produces two genetically identical daughter cells.',
        }]);
    });

    it('marks source coverage from verified evidence rather than model claims', () => {
        expect(tutorSourceStatus(1, 3, true)).toBe('supported');
        expect(tutorSourceStatus(0, 3, true)).toBe('not_found');
        expect(tutorSourceStatus(0, 0, true)).toBe('no_course_materials');
        expect(tutorSourceStatus(0, 0, false)).toBe('no_course_selected');
    });

    it('parses a structured model response and discards unverified citations', () => {
        expect(parseTutorResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({
            reply: 'Which part of the cell cycle comes first?',
            citations: [{ source_id: 'class_notes', excerpt: 'Mitosis produces two genetically identical daughter cells.' }],
        }) }] } }] }, sources)).toEqual({
            reply: 'Which part of the cell cycle comes first?',
            citations: [{ sourceId: 'class_notes', label: 'Class notes', excerpt: 'Mitosis produces two genetically identical daughter cells.' }],
        });
    });
});

describe('Study Companion loading and announcements', () => {
    let elements;
    function element(tagName = 'div') {
        const classes = new Set(['hidden']);
        return { tagName, className: '', classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
            children: [], textContent: '', value: '', disabled: false, focus: vi.fn(),
            appendChild(child) { this.children.push(child); },
        };
    }
    beforeEach(() => {
        vi.clearAllMocks();
        elements = Object.fromEntries(['tutorLoading', 'tutorLoadError', 'tutorPaywall', 'tutorWorkspace', 'tutorCourse', 'tutorMessages', 'tutorUsageStatus', 'tutorInput', 'tutorSend', 'tutorReplyStatus'].map((id) => [id, element()]));
        vi.stubGlobal('document', { getElementById: (id) => elements[id], createElement: (tagName) => element(tagName) });
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

    it('restores the current-page conversation when the page loads again', async () => {
        let resolveReply;
        mocks.invoke.mockImplementation(() => new Promise((resolve) => { resolveReply = resolve; }));
        elements.tutorInput.value = 'Explain a fictional study topic';
        const reply = submitTutorMessage();
        resolveReply({ data: { reply: 'What do you already know?' }, error: null });
        await reply;

        mocks.invoke.mockResolvedValue({ data: { usage: { usedThisMonth: 1, monthlyLimit: 10, usedToday: 1, dailyLimit: 4 } }, error: null });
        elements.tutorMessages = element();
        await loadTutorPage();
        expect(elements.tutorMessages.children.map((message) => message.children[0].textContent)).toEqual([
            'Explain a fictional study topic',
            'What do you already know?',
        ]);
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

    it('shows a verified course excerpt with a grounded reply', async () => {
        mocks.invoke.mockResolvedValue({ data: {
            reply: 'What is the role of mitosis in cell division?',
            sourceStatus: 'supported',
            citations: [{ sourceId: 'class_notes', label: 'Class notes', excerpt: 'Mitosis produces two genetically identical daughter cells.' }],
        }, error: null });
        elements.tutorInput.value = 'What does mitosis produce?';

        await submitTutorMessage();

        const assistantMessage = elements.tutorMessages.children.at(-1);
        expect(assistantMessage.children[0].textContent).toBe('What is the role of mitosis in cell division?');
        expect(assistantMessage.children[1].children[0].textContent).toBe('Course sources');
        expect(assistantMessage.children[1].children[1].children[0].textContent).toBe('Class notes');
        expect(assistantMessage.children[1].children[1].children[1].textContent)
            .toBe('“Mitosis produces two genetically identical daughter cells.”');
    });

    it('clearly marks replies that have no supporting course source', async () => {
        mocks.invoke.mockResolvedValue({ data: { reply: 'Let’s work through the concept step by step.', citations: [], sourceStatus: 'not_found' }, error: null });
        elements.tutorInput.value = 'Can you explain this?';

        await submitTutorMessage();

        const assistantMessage = elements.tutorMessages.children.at(-1);
        expect(assistantMessage.children[1].textContent).toContain('No course source supports this reply');
    });

    it('labels the composer and exposes conversation additions as a polite log', () => {
        const html = readFileSync(new URL('../tutor/index.html', import.meta.url), 'utf8');
        expect(html).toMatch(/id="tutorMessages"[^>]*role="log"[^>]*aria-live="polite"/);
        expect(html).toMatch(/id="tutorInput"[^>]*aria-label="Your study question"/);
        expect(html).toMatch(/id="tutorLoading"[^>]*role="status"/);
        expect(html).toContain('may be sent to Gemini with your question');
    });
});
