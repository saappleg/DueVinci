import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { client, upsert } = vi.hoisted(() => ({
    client: { from: vi.fn() },
    upsert: vi.fn(),
}));

vi.mock('../js/modules/config.js', () => ({ supabaseClient: client }));
vi.mock('../js/modules/auth.js', () => ({ currentUser: { id: 'user-1' } }));
vi.mock('../js/modules/studyPlan.js', () => ({ generateBalancedStudyPlan: () => [] }));
vi.mock('../js/modules/weekPreferences.js', () => ({ getWeekStartDayIndex: () => 1 }));
vi.mock('../js/modules/studyCalibration.js', () => ({
    getStudyCalibrationContext: async () => null,
    recordStudyPlanCompletionIfEntitled: vi.fn(),
    removeStudyPlanCompletion: vi.fn(),
}));
vi.mock('../js/modules/utils.js', () => ({
    fireConfetti: vi.fn(),
    getLocalDateKey: (date) => date.toISOString().slice(0, 10),
    escapeHtml: (value) => String(value),
}));

import {
    closeCalendarEventActions,
    createAssignmentFromCalendarEvent,
    openCalendarEventActions,
} from '../js/modules/calendar.js';

describe('Calendar event assignment conversion', () => {
    let elements;

    beforeEach(() => {
        vi.clearAllMocks();
        elements = Object.fromEntries([
            'calendarEventActionsModal', 'calendarEventActionsTitle', 'calendarEventActionsDate',
            'calendarEventCourseSelect', 'calendarEventActionsStatus', 'calendarEventCreateAssignment',
            'calendarEventDeleteButton', 'calendarImportStatus',
        ].map((id) => [id, {
            value: '', textContent: '', innerHTML: '', disabled: false,
            classList: { add: vi.fn(), remove: vi.fn() },
            setAttribute: vi.fn(), focus: vi.fn(),
        }]));
        vi.stubGlobal('document', {
            activeElement: null,
            getElementById: (id) => elements[id] || null,
        });
        upsert.mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'assignment-1' }], error: null }),
        });
        client.from.mockImplementation((table) => {
            const data = table === 'courses'
                ? [{ id: 'course-1', code: 'BIO 101', start_date: '2026-08-01', end_date: '2026-12-20' }]
                : [];
            const query = { data, error: null };
            query.eq = vi.fn().mockReturnValue(query);
            query.order = vi.fn().mockResolvedValue({ data, error: null });
            return { select: vi.fn().mockReturnValue(query), upsert };
        });
    });

    afterEach(() => {
        closeCalendarEventActions();
        vi.unstubAllGlobals();
    });

    async function chooseCourse() {
        await openCalendarEventActions({
            title: 'Fictional biology review', startStr: '2026-10-20',
            extendedProps: { eventId: 'calendar-event-1' },
        });
        elements.calendarEventCourseSelect.value = 'course-1';
    }

    it('saves the selected event ID as the assignment deduplication key', async () => {
        await chooseCourse();
        await createAssignmentFromCalendarEvent();

        expect(upsert).toHaveBeenCalledWith([
            expect.objectContaining({
                user_id: 'user-1', course_id: 'course-1', title: 'Fictional biology review',
                due_date: '2026-10-20', source_calendar_event_id: 'calendar-event-1',
            }),
        ], { onConflict: 'user_id,source_calendar_event_id', ignoreDuplicates: true });
        expect(elements.calendarImportStatus.textContent).toContain('Created');
        expect(elements.calendarEventActionsModal.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('keeps the dialog open when the event was already converted elsewhere', async () => {
        upsert.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
        await chooseCourse();
        await createAssignmentFromCalendarEvent();

        expect(upsert).toHaveBeenCalledOnce();
        expect(elements.calendarEventActionsStatus.textContent).toContain('already has an assignment');
        expect(elements.calendarEventCreateAssignment.disabled).toBe(false);
        expect(elements.calendarEventActionsModal.classList.add).not.toHaveBeenCalled();
    });
});
