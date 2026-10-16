import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeDailyBrief } from '../js/modules/today.js';
import { getWeekStartDayIndex, setWeekStartDay, normalizeWeekStartDay } from '../js/modules/weekPreferences.js';

afterEach(() => vi.unstubAllGlobals());

describe('Daily Brief assignment summary', () => {
    it('counts only open work in the current study week and excludes finished or inactive-course work', () => {
        const referenceDate = new Date(2026, 9, 15, 12); // Thursday
        const courses = [
            { id: 'weekly', pacing_type: 'weekly' },
            { id: 'completed-course', is_completed: true },
            { id: 'self-paced', pacing_type: 'self-paced' },
        ];
        const assignments = [
            { id: 'today', course_id: 'weekly', title: 'Unit 3 Check-in', due_date: '2026-10-15', is_completed: false },
            { id: 'friday', course_id: 'weekly', title: 'Unit 3 Quiz', due_date: '2026-10-16', is_completed: false },
            { id: 'sunday', course_id: 'weekly', title: 'Unit 3 Reading', due_date: '2026-10-18', is_completed: false },
            { id: 'next-week-unit', course_id: 'weekly', title: 'Unit 4 Quiz', due_date: '2026-10-19', is_completed: false },
            { id: 'next-week-self-paced', course_id: 'self-paced', title: 'Research paper', due_date: '2026-10-19', is_completed: false },
            { id: 'bare-unit-heading', course_id: 'weekly', title: 'Unit', due_date: '2026-10-16', is_completed: false },
            { id: 'bare-week-heading', course_id: 'weekly', title: 'Week –', due_date: '2026-10-16', is_completed: false },
            { id: 'finished-task', course_id: 'weekly', title: 'Unit 3 Lab', due_date: '2026-10-16', is_completed: true },
            { id: 'completed-course-task', course_id: 'completed-course', title: 'Reflection', due_date: '2026-10-16', is_completed: false },
            { id: 'unit-heading', course_id: 'weekly', title: 'Week 3', due_date: '2026-10-16', is_completed: false },
        ];

        const summary = summarizeDailyBrief(courses, assignments, referenceDate);

        expect(summary.today).toBe('2026-10-15');
        expect(summary.weekEnd).toBe('2026-10-18');
        expect(summary.openTasks.map((task) => task.id)).toEqual(['today', 'friday', 'sunday', 'next-week-self-paced']);
        expect(summary.dueTodayTasks.map((task) => task.id)).toEqual(['today']);
        expect(summary.dueThisWeekTasks.map((task) => task.id)).toEqual(['friday', 'sunday']);
    });

    it('uses the chosen week start for the end of the current week', () => {
        const values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
        });
        setWeekStartDay('sunday');

        const summary = summarizeDailyBrief([], [
            { id: 'saturday', title: 'Saturday deadline', due_date: '2026-10-17', is_completed: false },
            { id: 'sunday', title: 'Sunday deadline', due_date: '2026-10-18', is_completed: false },
        ], new Date(2026, 9, 15, 12));

        expect(getWeekStartDayIndex()).toBe(0);
        expect(summary.weekEnd).toBe('2026-10-17');
        expect(summary.dueThisWeekTasks.map((task) => task.id)).toEqual(['saturday']);
        expect(normalizeWeekStartDay('unsupported')).toBe('monday');
    });

    it('moves weekly-paced unit rollover with the selected week boundary', () => {
        const values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
        });
        const courses = [{ id: 'weekly', pacing_type: 'weekly' }];
        const assignments = [
            { id: 'unit-three', course_id: 'weekly', title: 'Unit 3 Quiz', due_date: '2026-10-16', is_completed: false },
            { id: 'unit-four', course_id: 'weekly', title: 'Unit 4 Quiz', due_date: '2026-10-18', is_completed: false },
        ];
        const referenceDate = new Date(2026, 9, 15, 12);

        setWeekStartDay('monday');
        const mondaySummary = summarizeDailyBrief(courses, assignments, referenceDate);
        setWeekStartDay('sunday');
        const sundaySummary = summarizeDailyBrief(courses, assignments, referenceDate);

        expect(mondaySummary.openTasks.map((task) => task.id)).toEqual(['unit-three', 'unit-four']);
        expect(sundaySummary.openTasks.map((task) => task.id)).toEqual(['unit-three']);
    });
});
