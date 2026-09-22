import { describe, expect, it } from 'vitest';
import {
    buildCustomEventPayload,
    buildCustomEventRows,
    expandICSRecurrence,
    parseICSCalendar
} from '../js/modules/calendar.js';

describe('Calendar import and custom event utilities', () => {
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
    });
});
