import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseClient } from '../js/modules/config.js';
import { completeTodayTask, startTodayFocus, summarizeDailyBrief } from '../js/modules/today.js';
import { consumeCompletedTaskTimerMarker, hasCompletedTaskTimerSession, recordCompletedTaskTimerMarker } from '../js/modules/timers.js';
import { getLocalDateKey } from '../js/modules/utils.js';
import { getWeekStartDayIndex, setWeekStartDay, normalizeWeekStartDay } from '../js/modules/weekPreferences.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Daily Brief study activity', () => {
    it('uses a completed task-linked timer marker once for the local day', () => {
        localStorage.clear();
        const date = getLocalDateKey();

        expect(recordCompletedTaskTimerMarker('a1', date)).toBe(true);
        expect(hasCompletedTaskTimerSession('a1', date)).toBe(true);
        expect(consumeCompletedTaskTimerMarker('a1', date)).toBe(true);
        expect(hasCompletedTaskTimerSession('a1', date)).toBe(false);
        expect(consumeCompletedTaskTimerMarker('a1', date)).toBe(false);
    });

    it('starts a task-linked focus timer from Daily Brief', () => {
        const setStudyFocusContext = vi.fn();
        vi.stubGlobal('window', {
            setTimerDuration: vi.fn(),
            setStudyFocusContext,
            timerRunning: false,
            toggleTimer: vi.fn(),
        });

        startTodayFocus(25, 'a1', 'c1', 'lesson', 'Lesson 1', 35);

        expect(setStudyFocusContext).toHaveBeenCalledWith({
            taskId: 'a1',
            courseId: 'c1',
            taskType: 'lesson',
            estimatedMinutes: 35,
        });
    });

    it('does not record study activity or consume the timer marker when the assignment update fails', async () => {
        localStorage.clear();
        const date = getLocalDateKey();
        recordCompletedTaskTimerMarker('a1', date);
        vi.stubGlobal('document', { getElementById: () => null });
        const query = {
            update: vi.fn(function () { return this; }),
            eq: vi.fn(function () { return this; }),
            select: vi.fn(function () { return this; }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.spyOn(supabaseClient, 'from').mockReturnValue(query);

        expect(await completeTodayTask('a1')).toBe(false);
        expect(localStorage.getItem('duevinci_activity_dates')).toBeNull();
        expect(hasCompletedTaskTimerSession('a1', date)).toBe(true);
    });

    it('records activity, sets completion progress, and consumes the marker after a successful completion', async () => {
        localStorage.clear();
        localStorage.setItem('duevinci_study_calibration_enabled', 'false');
        const date = getLocalDateKey();
        recordCompletedTaskTimerMarker('a1', date);
        const query = {
            update: vi.fn(function () { return this; }),
            eq: vi.fn(function () { return this; }),
            select: vi.fn(function () { return this; }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null }),
        };
        vi.spyOn(supabaseClient, 'from').mockReturnValue(query);

        expect(await completeTodayTask('a1', 'c1', 'lesson', 'Lesson 1', 35)).toBe(true);
        expect(query.update).toHaveBeenCalledWith({ is_completed: true, progress_percent: 100 });
        expect(JSON.parse(localStorage.getItem('duevinci_activity_dates'))).toContain(date);
        expect(hasCompletedTaskTimerSession('a1', date)).toBe(false);
    });
});

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
