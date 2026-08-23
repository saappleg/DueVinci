import { describe, it, expect, beforeAll } from 'vitest';

describe('Academic Utilities', () => {
    let calculateStudyStreak;
    let calculateCumulativeGpa;
    let getWorkloadIntensity;
    let calculateDaysRemaining;
    let getSevenDayWorkload;

    beforeAll(async () => {
        const mod = await import('../js/modules/academics.js');
        calculateStudyStreak = mod.calculateStudyStreak || globalThis.calculateStudyStreak;
        calculateCumulativeGpa = mod.calculateCumulativeGpa || globalThis.calculateCumulativeGpa;
        getWorkloadIntensity = mod.getWorkloadIntensity || globalThis.getWorkloadIntensity;
        calculateDaysRemaining = mod.calculateDaysRemaining || globalThis.calculateDaysRemaining;
        getSevenDayWorkload = mod.getSevenDayWorkload || globalThis.getSevenDayWorkload;
    });

    describe('calculateStudyStreak', () => {
        it('returns 0 for empty or invalid activity history', () => {
            expect(calculateStudyStreak([])).toBe(0);
            expect(calculateStudyStreak(null)).toBe(0);
        });

        it('calculates consecutive active days starting today', () => {
            const today = new Date('2026-08-20T12:00:00Z');
            const dates = ['2026-08-18', '2026-08-19', '2026-08-20'];
            expect(calculateStudyStreak(dates, today)).toBe(3);
        });

        it('retains streak if active yesterday but not yet recorded today', () => {
            const today = new Date('2026-08-20T12:00:00Z');
            const dates = ['2026-08-17', '2026-08-18', '2026-08-19'];
            expect(calculateStudyStreak(dates, today)).toBe(3);
        });

        it('breaks streak when there is a missing day gap', () => {
            const today = new Date('2026-08-20T12:00:00Z');
            const dates = ['2026-08-15', '2026-08-16', '2026-08-19', '2026-08-20'];
            expect(calculateStudyStreak(dates, today)).toBe(2);
        });
    });

    describe('calculateDaysRemaining', () => {
        it('returns correct days count for future date', () => {
            const baseDate = new Date('2026-08-20T12:00:00Z');
            expect(calculateDaysRemaining('2026-08-25', baseDate)).toBe(5);
        });

        it('handles same-day due dates', () => {
            const baseDate = new Date('2026-08-20T12:00:00Z');
            expect(calculateDaysRemaining('2026-08-20', baseDate)).toBe(0);
        });

        it('returns negative or 0 for past due dates', () => {
            const baseDate = new Date('2026-08-20T12:00:00Z');
            expect(calculateDaysRemaining('2026-08-18', baseDate)).toBeLessThan(0);
        });
    });

    describe('getWorkloadIntensity', () => {
        it('prioritizes Exam status regardless of task count', () => {
            const res = getWorkloadIntensity(1, true);
            expect(res.statusLabel).toBe('🔥 Exam');
            expect(res.intensityClass).toContain('animate-pulse');
        });

        it('returns heavy workload for 4 or more tasks', () => {
            const res = getWorkloadIntensity(5, false);
            expect(res.statusLabel).toBe('5 Tasks');
            expect(res.intensityClass).toContain('text-rose-700');
        });

        it('returns moderate workload for 2-3 tasks', () => {
            const res = getWorkloadIntensity(3, false);
            expect(res.statusLabel).toBe('3 Tasks');
            expect(res.intensityClass).toContain('text-amber-700');
        });

        it('returns light workload for 1 task', () => {
            const res = getWorkloadIntensity(1, false);
            expect(res.statusLabel).toBe('1 Task');
            expect(res.intensityClass).toContain('text-indigo-700');
        });

        it('returns Chill for 0 tasks', () => {
            const res = getWorkloadIntensity(0, false);
            expect(res.statusLabel).toBe('Chill');
            expect(res.intensityClass).toContain('text-emerald-700');
        });
    });

    describe('getSevenDayWorkload', () => {
        it('counts date-only and ISO-timestamp deadlines on the same calendar day', () => {
            const workload = getSevenDayWorkload([
                { id: 'a', title: 'Essay', due_date: '2026-08-21', is_completed: false },
                { id: 'b', title: 'Midterm', due_date: '2026-08-21T18:00:00Z', is_completed: false },
                { id: 'c', title: 'Done task', due_date: '2026-08-21', is_completed: true }
            ], new Date('2026-08-20T12:00:00'), 2, task => /midterm/i.test(task.title));

            expect(workload[1].dayTasks).toBe(2);
            expect(workload[1].hasExam).toBe(true);
            expect(workload[1].intensity.statusLabel).toBe('🔥 Exam');
        });
    });

    describe('calculateCumulativeGpa', () => {
        it('returns 0.00 for empty or invalid course averages', () => {
            expect(calculateCumulativeGpa([])).toBe('0.00');
            expect(calculateCumulativeGpa(['invalid'])).toBe('0.00');
        });

        it('accurately calculates 4.0 scale GPA', () => {
            // 90%, 100%, 80% => avg 90% => 3.60 on 4.0 scale
            expect(calculateCumulativeGpa([90, 100, 80], 4.0)).toBe('3.60');
        });

        it('accurately calculates 5.0 scale GPA', () => {
            // 100%, 100% => 5.00 on 5.0 scale
            expect(calculateCumulativeGpa([100, 100], 5.0)).toBe('5.00');
            // 80% => 4.00 on 5.0 scale
            expect(calculateCumulativeGpa([80], 5.0)).toBe('4.00');
        });
    });
});
