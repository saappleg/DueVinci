import { afterEach, describe, expect, it, vi } from 'vitest';
const calendarMocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../js/modules/config.js', () => ({ supabaseClient: { from: calendarMocks.from } }));
import {
    buildCustomEventPayload,
    buildCustomEventRows,
    buildCalendarAssignmentPayload,
    findMatchingCalendarAssignment,
    expandICSRecurrence,
    parseICSCalendar,
    parseICSDate,
    calendarInstance,
    initCalendar,
    initCalendarForm,
    disposeCalendar
} from '../js/modules/calendar.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Calendar import and custom event utilities', () => {
    it('destroys the calendar instance before leaving the route so it can mount again', () => {
        const calendarElement = {};
        const instance = { render: vi.fn(), destroy: vi.fn() };
        const Calendar = vi.fn(function () { return instance; });
        vi.stubGlobal('document', { getElementById: (id) => id === 'calendar' ? calendarElement : null });
        vi.stubGlobal('FullCalendar', { Calendar });

        initCalendar();
        expect(calendarInstance).toBe(instance);
        expect(instance.render).toHaveBeenCalledOnce();

        disposeCalendar();
        expect(instance.destroy).toHaveBeenCalledOnce();
        expect(calendarInstance).toBeNull();
    });

    it('binds the custom-event form once when Calendar is entered after page load', () => {
        const form = { dataset: {}, addEventListener: vi.fn() };
        vi.stubGlobal('document', { getElementById: (id) => id === 'customEventForm' ? form : null });

        initCalendarForm();
        initCalendarForm();

        expect(form.addEventListener).toHaveBeenCalledOnce();
        expect(form.addEventListener).toHaveBeenCalledWith('submit', expect.any(Function));
        expect(form.dataset.bound).toBe('true');
    });

    it('ignores calendar results that finish after the route was disposed and remounted', async () => {
        let resolveStaleCourses;
        const staleCourses = new Promise((resolve) => { resolveStaleCourses = resolve; });
        let courseQueries = 0;
        calendarMocks.from.mockImplementation((table) => ({
            select: () => {
                if (table === 'courses' && courseQueries++ === 0) return staleCourses;
                return Promise.resolve({ data: null, error: null });
            }
        }));

        const calendarElement = {};
        const oldInstance = { render: vi.fn(), destroy: vi.fn(), removeAllEvents: vi.fn(), addEventSource: vi.fn() };
        const newInstance = { render: vi.fn(), destroy: vi.fn(), removeAllEvents: vi.fn(), addEventSource: vi.fn() };
        const instances = [oldInstance, newInstance];
        vi.stubGlobal('document', { getElementById: (id) => id === 'calendar' ? calendarElement : null });
        vi.stubGlobal('FullCalendar', { Calendar: vi.fn(function () { return instances.shift(); }) });

        initCalendar();
        const staleLoad = loadCalendarCourses();
        disposeCalendar();
        initCalendar();
        await loadCalendarCourses();
        resolveStaleCourses({ data: [{ id: 'old-course' }], error: null });
        await staleLoad;

        expect(oldInstance.destroy).toHaveBeenCalledOnce();
        expect(newInstance.removeAllEvents).toHaveBeenCalledOnce();
        expect(newInstance.addEventSource).toHaveBeenCalledOnce();
        disposeCalendar();
    });

    it('rejects impossible calendar dates instead of allowing JavaScript normalization', () => {
        expect(parseICSDate('20260231')).toBeNull();
        expect(parseICSDate('20260921T120000Z')).toBe('2026-09-21');
    });

    it('parses escaped event names and all-day dates from an ICS export', () => {
        const rows = parseICSCalendar([
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'SUMMARY:Study Group\\, Databases',
            'DTSTART;VALUE=DATE:20260921',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n'));

        expect(rows).toEqual([{ title: 'Study Group, Databases', event_date: '2026-09-21', color: '#8b5cf6' }]);
    });

    it('expands recurring and multi-day events into date-based rows', () => {
        const rows = parseICSCalendar([
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'SUMMARY:Weekly lab',
            'DTSTART;VALUE=DATE:20260921',
            'DTEND;VALUE=DATE:20260923',
            'RRULE:FREQ=WEEKLY;COUNT=2',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\n'));

        expect(rows.map((row) => row.event_date)).toEqual([
            '2026-09-21', '2026-09-22', '2026-09-28', '2026-09-29'
        ]);
    });

    it('supports recurrence intervals, multiple weekly weekdays, and caps expansion', () => {
        expect(expandICSRecurrence('2026-09-21', 'FREQ=DAILY;INTERVAL=2;COUNT=5')).toEqual([
            '2026-09-21', '2026-09-23', '2026-09-25', '2026-09-27', '2026-09-29'
        ]);
        expect(expandICSRecurrence('2026-09-21', 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4')).toEqual([
            '2026-09-21', '2026-09-23', '2026-09-28', '2026-09-30'
        ]);
        expect(parseICSCalendar('BEGIN:VEVENT\nSUMMARY:Too many\nDTSTART;VALUE=DATE:20260921\nRRULE:FREQ=DAILY;COUNT=10\nEND:VEVENT', { maxOccurrences: 3 })).toHaveLength(3);
    });

    it('keeps month-end recurrences valid and supports monthly rule selectors', () => {
        expect(expandICSRecurrence('2026-01-31', 'FREQ=MONTHLY;COUNT=3')).toEqual([
            '2026-01-31', '2026-02-28', '2026-03-31'
        ]);
        expect(expandICSRecurrence('2026-01-01', 'FREQ=MONTHLY;BYDAY=1MO;COUNT=3')).toEqual([
            '2026-01-05', '2026-02-02', '2026-03-02'
        ]);
    });

    it('honors EXDATE values in recurring calendar imports', () => {
        const rows = parseICSCalendar([
            'BEGIN:VEVENT',
            'SUMMARY:Weekly lab',
            'DTSTART;VALUE=DATE:20260921',
            'RRULE:FREQ=WEEKLY;COUNT=3',
            'EXDATE;VALUE=DATE:20260928',
            'END:VEVENT'
        ].join('\n'));

        expect(rows.map((row) => row.event_date)).toEqual(['2026-09-21', '2026-10-05']);
    });

    it('builds validated custom-event rows for a manual multi-day event', () => {
        expect(buildCustomEventPayload({ userId: 'user-1', title: 'Office hours', eventDate: '2026-09-22' })).toEqual({
            user_id: 'user-1',
            title: 'Office hours',
            event_date: '2026-09-22',
            color: '#8b5cf6'
        });
        expect(buildCustomEventRows({
            userId: 'user-1',
            title: 'Conference',
            startDate: '2026-09-22',
            endDate: '2026-09-24'
        }).map((row) => row.event_date)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
        expect(() => buildCustomEventPayload({ userId: 'user-1', title: '', eventDate: '2026-09-22' })).toThrow('Event title is required.');
        expect(() => buildCustomEventPayload({ userId: 'user-1', title: 'Invalid', eventDate: '2026-02-31' })).toThrow('valid event date');
        expect(() => buildCustomEventRows({ userId: 'user-1', title: 'Too long', startDate: '2026-01-01', endDate: '2027-01-02' })).toThrow('at most 366 days');
    });

    it('creates a clean assignment from a calendar event and detects duplicates by class, title, and date', () => {
        expect(buildCalendarAssignmentPayload({
            userId: 'user-1', courseId: 'course-1', title: '  Midterm review  ', dueDate: '2026-10-12T00:00:00Z', calendarEventId: 'event-1'
        })).toEqual({
            user_id: 'user-1', course_id: 'course-1', title: 'Midterm review', due_date: '2026-10-12',
            task_type: 'assignment', type: 'assignment', priority: 'medium', is_completed: false, source_calendar_event_id: 'event-1'
        });
        const assignments = [
            { id: 'a1', course_id: 'course-1', title: 'Midterm Review', due_date: '2026-10-12T04:00:00Z' },
            { id: 'a2', course_id: 'course-2', title: 'Midterm review', due_date: '2026-10-12' }
        ];
        expect(findMatchingCalendarAssignment(assignments, { courseId: 'course-1', title: 'midterm review', dueDate: '2026-10-12' })).toBe(assignments[0]);
        expect(findMatchingCalendarAssignment(assignments, { courseId: 'course-1', title: 'Midterm review', dueDate: '2026-10-13' })).toBeNull();
        expect(() => buildCalendarAssignmentPayload({ userId: 'u1', courseId: 'c1', title: 'Invalid', dueDate: '2026-02-31', calendarEventId: 'event-2' })).toThrow('valid date');
        expect(() => buildCalendarAssignmentPayload({ userId: 'u1', courseId: 'c1', title: 'Valid', dueDate: '2026-02-28' })).toThrow('cannot be linked');
    });
});
