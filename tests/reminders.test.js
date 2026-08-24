import { describe, expect, it } from 'vitest';
import { collectReminderItems } from '../js/modules/reminders.js';

describe('Due-date reminders', () => {
    const now = new Date(2026, 7, 24, 10, 0, 0);

    it('includes incomplete coursework and dated calendar events in date order', () => {
        const items = collectReminderItems(
            [
                { id: 'done', title: 'Finished work', due_date: '2026-08-24', is_completed: true, course_id: 'c1' },
                { id: 'essay', title: 'Essay draft', due_date: '2026-08-25', is_completed: false, course_id: 'c1' },
            ],
            [{ id: 'study', title: 'Study group', event_date: '2026-08-24' }],
            [{ id: 'c1', name: 'Writing' }],
            now
        );

        expect(items.map((item) => item.id)).toEqual(['event:study', 'assignment:essay']);
        expect(items[0]).toMatchObject({ kind: 'Study session', daysUntil: 0 });
        expect(items[1]).toMatchObject({ detail: 'Writing', daysUntil: 1 });
    });

    it('does not remind about past dates', () => {
        const items = collectReminderItems(
            [{ id: 'old', title: 'Old task', due_date: '2026-08-23', is_completed: false }],
            [], [], now
        );
        expect(items).toEqual([]);
    });
});
