import { describe, expect, it } from 'vitest';
import {
    buildCustomEventPayload,
    buildCustomEventRows,
    expandICSRecurrence,
    parseICSCalendar,
    parseICSDate
} from '../js/modules/calendar.js';

describe('Calendar import and custom event utilities', () => {
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
});
