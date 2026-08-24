import { describe, expect, it } from 'vitest';
import { summarizeWeeklyPlan } from '../js/modules/weeklyReview.js';

describe('Weekly review workload summary', () => {
    it('flags overloaded study days while retaining rest days and completion totals', () => {
        const summary = summarizeWeeklyPlan([
            { totalMinutes: 75, isRestDay: false },
            { totalMinutes: 0, isRestDay: true },
            { totalMinutes: 150, isRestDay: false, displayDate: 'Aug 26' },
        ], [
            { id: 'done', is_completed: true },
            { id: 'open', is_completed: false, due_date: '2026-08-26' },
        ]);
        expect(summary).toMatchObject({ totalMinutes: 225, activeDays: 2, completed: 1, upcoming: 1 });
        expect(summary.overloaded).toHaveLength(1);
        expect(summary.heaviest.totalMinutes).toBe(150);
    });
});
