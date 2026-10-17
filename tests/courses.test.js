import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseClient } from '../js/modules/config.js';
import { generateBalancedStudyPlan } from '../js/modules/studyPlan.js';
import {
    extractAssignmentChecklistSteps,
    normalizeAssignmentChecklistProposalLines,
    getNewAssignmentChecklistSteps,
    normalizeSyllabusReviewUnits,
    importReviewedCourseworkUnits,
    formatCourseworkImportStatus,
    buildWeeklyRecurrenceDates,
    buildRescheduleUpdates,
    buildSequencePlanUpdates,
    compareCourseworkOrder,
    getAssignmentProgress,
    getCoursePacingProfile,
    getCoursePacingUpdates,
    renderAssignmentCompletionControl,
    renderAssignmentGradeabilityControl,
    loadAssignments,
    toggleAssignmentGradeable
} from '../js/modules/courses.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Assignment instruction checklists', () => {
    it('extracts proposed steps from lines and sentence boundaries without inventing content', () => {
        expect(extractAssignmentChecklistSteps('Instructions:\n1. Read chapter 2. Write a short summary.\n- Bring your draft; note two questions.'))
            .toEqual([
                'Read chapter 2.',
                'Write a short summary.',
                'Bring your draft',
                'note two questions.'
            ]);
    });

    it('deduplicates and limits editable proposal lines', () => {
        expect(normalizeAssignmentChecklistProposalLines('- Read the chapter\nRead the chapter\n2. Draft notes\nSubmit', 2))
            .toEqual(['Read the chapter', 'Draft notes']);
        expect(extractAssignmentChecklistSteps('One\nTwo\nThree', 2)).toEqual(['One', 'Two']);
    });

    it('filters duplicate reviewed steps from linked and legacy arrow subtasks in the same unit', () => {
        const parent = { id: 'unit-1', unit_number: 1, due_date: '2026-09-15' };
        const existing = [
            { id: 'linked', parent_assignment_id: 'unit-1', title: '↳ Read chapter', unit_number: 2 },
            { id: 'legacy', title: '↳ Draft notes', unit_number: 1 },
            { id: 'legacy-no-unit', title: '↳ Review notes', due_date: '2026-09-15' },
            { id: 'other-unit', title: '↳ Submit draft', unit_number: 2 },
            { id: 'not-a-subtask', title: 'Write reflection', unit_number: 1 }
        ];

        expect(getNewAssignmentChecklistSteps('Read chapter\nDraft notes\nReview notes\nSubmit draft\nWrite reflection', parent, existing))
            .toEqual(['Submit draft', 'Write reflection']);
    });
});

describe('Reviewed syllabus coursework writes', () => {
    it('reports partial failures and skips lesson inserts when their unit insert fails', async () => {
        const attemptedTitles = [];
        const result = await importReviewedCourseworkUnits([
            {
                num: 1,
                title: 'Rejected unit',
                dateStr: '2026-09-01',
                lessons: [{ title: 'Do not insert this lesson' }]
            },
            {
                num: 2,
                title: 'Saved unit',
                dateStr: '2026-09-08',
                endDateStr: '2026-09-15',
                lessons: [{ title: 'Saved lesson' }, { title: 'Rejected lesson' }]
            }
        ], {}, 'course-1', {
            userId: 'user-1',
            insertAssignments: async (rows, returningRows = false) => {
                const title = rows[0].title;
                attemptedTitles.push({ title, returningRows });
                if (title === 'Unit 1: Rejected unit') return { error: { message: 'unit insert denied' } };
                if (title === 'Unit 2: Saved unit') return { data: [{ id: 'saved-unit' }], error: null };
                if (title === '↳ Lesson 2: Rejected lesson') return { error: { message: 'lesson insert denied' } };
                return { data: null, error: null };
            }
        });

        expect(attemptedTitles.map(({ title }) => title)).toEqual([
            'Unit 1: Rejected unit',
            'Unit 2: Saved unit',
            '↳ Lesson 1: Saved lesson',
            '↳ Lesson 2: Rejected lesson'
        ]);
        expect(attemptedTitles[0].returningRows).toBe(true);
        expect(result).toMatchObject({
            unitsInserted: 1,
            lessonsInserted: 1,
            failedUnits: 1,
            failedLessons: 1,
            skippedLessons: 1
        });
        const status = formatCourseworkImportStatus(result);
        expect(status.tone).toBe('warning');
        expect(status.message).toContain('Partially imported.');
        expect(status.message).toContain('1 lesson skipped because its unit could not be saved.');
        expect(status.message).toContain('unit insert denied');
        expect(status.message).toContain('lesson insert denied');
    });

    it('uses an error status when no course rows were saved', () => {
        expect(formatCourseworkImportStatus({ failedUnits: 1, errors: ['Unit insert denied'] }))
            .toMatchObject({ tone: 'error', message: expect.stringContaining('Coursework import failed.') });
    });
});

describe('Syllabus row review model', () => {
    it('normalizes and date-orders editable unit and lesson rows', () => {
        const rows = normalizeSyllabusReviewUnits([
            { num: 2, title: 'Later unit', dateStr: '2026-03-09', lessons: ['Later lesson'] },
            { num: 1, title: 'Earlier unit', dateStr: '2026-03-02', endDateStr: '2026-03-06', lessons: [{ title: 'Read chapter', dateStr: '2026-03-03' }, 'Draft notes'] }
        ], new Date('2026-02-23T12:00:00'));

        expect(rows.map((row) => row.title)).toEqual(['Earlier unit', 'Later unit']);
        expect(rows[0].lessons).toEqual([
            { title: 'Read chapter', dateStr: '2026-03-03', autoDate: false },
            { title: 'Draft notes', dateStr: '2026-03-06', autoDate: true }
        ]);
        expect(normalizeSyllabusReviewUnits('invalid')).toEqual([]);
    });
});

describe('Coursework progress', () => {
    it('uses saved partial progress and treats completed work as fully complete', () => {
        expect(getAssignmentProgress({ progress_percent: 35 })).toBe(35);
        expect(getAssignmentProgress({ is_completed: true, progress_percent: 35 })).toBe(100);
        expect(getAssignmentProgress({ progress_percent: 140 })).toBe(100);
        expect(getAssignmentProgress({ progress_percent: -5 })).toBe(0);
        expect(getAssignmentProgress({})).toBe(0);
    });

    it('plans only the remaining estimated study time for partially completed coursework', () => {
        const plan = generateBalancedStudyPlan(
            [{ id: 'course-1', code: 'BIO' }],
            [{ id: 'task-1', course_id: 'course-1', title: 'Reading', due_date: '2026-09-15', progress_percent: 40 }],
            new Date('2026-09-15T12:00:00'),
            1,
        );

        expect(plan[0].allBlocks.find((block) => block.taskId === 'task-1').durationMinutes).toBe(15);
    });
});

describe('Weekly recurring coursework', () => {
    it('creates inclusive weekly dates without relying on local daylight-saving time', () => {
        expect(buildWeeklyRecurrenceDates('2026-03-01', '2026-03-22')).toEqual({
            dates: ['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'],
            error: null,
        });
    });

    it('rejects invalid dates, ranges shorter than a week, and overly large series', () => {
        expect(buildWeeklyRecurrenceDates('2026-02-30', '2026-03-22').error).toContain('valid due date');
        expect(buildWeeklyRecurrenceDates('2026-03-01', '2026-03-07').error).toContain('at least one week');
        expect(buildWeeklyRecurrenceDates('2026-01-01', '2027-01-01', 10).error).toContain('limited to 10');
    });
});

describe('Coursework completion control', () => {
    it('names the assignment, exposes completion state, and preserves the correct toggle arguments', () => {
        const control = renderAssignmentCompletionControl({
            id: 'assignment-7',
            title: 'Lesson 7: <Loops & Logic>',
            is_completed: true
        }, 'course-3');

        expect(control).toContain('aria-label="Complete Lesson 7: &lt;Loops &amp; Logic&gt;"');
        expect(control).toContain('aria-pressed="true"');
        expect(control).toContain("toggleAssignment('assignment-7', true, 'course-3')");
        expect(control).toContain('h-11 w-11');
    });
});

describe('Coursework Grades selection', () => {
    it('defaults missing and false gradeability flags to off and labels the item accessibly', () => {
        const missingFlag = renderAssignmentGradeabilityControl({
            id: 'lesson-1',
            title: '↳ Lesson 1: <Cells & DNA>'
        });
        const optedIn = renderAssignmentGradeabilityControl({
            id: 'lesson-2',
            title: '↳ Lesson 2',
            is_gradeable: true
        });

        expect(missingFlag).toContain('Include in Grades: ↳ Lesson 1: &lt;Cells &amp; DNA&gt;');
        expect(missingFlag).toContain('data-saved-gradeable="false"');
        expect(missingFlag).not.toMatch(/data-assignment-gradeable[^>]*\schecked(?:\s|>)/);
        expect(missingFlag).toContain('toggleAssignmentGradeable(this.dataset.assignmentId, this.checked, this)');
        expect(optedIn).toContain('data-saved-gradeable="true"');
        expect(optedIn).toMatch(/data-assignment-gradeable[^>]*\schecked(?:\s|>)/);
        expect(missingFlag).toContain('Include in Grades</span>');
        expect(missingFlag).toContain('data-gradeability-status role="status" aria-live="polite"');
    });

    it('saves a lesson in place, updates the cached row, and preserves the rendered page', async () => {
        const assignment = {
            id: 'lesson-1', course_id: 'course-1', title: '↳ Lesson 1: Cells',
            is_gradeable: false, is_completed: false, progress_percent: 0
        };
        const requests = [];
        vi.spyOn(supabaseClient, 'from').mockImplementation((table) => {
            let action = 'select';
            const request = { table, action, payload: null, columns: null, filters: [] };
            const query = {
                update(payload) {
                    action = 'update';
                    request.action = action;
                    request.payload = payload;
                    return query;
                },
                select(columns) {
                    request.columns = columns;
                    return query;
                },
                eq(column, value) {
                    request.filters.push({ column, value });
                    return query;
                },
                maybeSingle() { return query; },
                then(resolve, reject) {
                    const result = request.action === 'update'
                        ? { data: { id: assignment.id, is_gradeable: true }, error: null }
                        : { data: [assignment], error: null };
                    return Promise.resolve(result).then(resolve, reject);
                }
            };
            requests.push(request);
            return query;
        });
        const assignmentList = { innerHTML: '' };
        const getElementById = vi.fn((id) => id === 'assignmentList' ? assignmentList : null);
        vi.stubGlobal('document', {
            getElementById
        });
        await loadAssignments('course-1');
        const renderedPage = assignmentList.innerHTML;
        const domReadCount = getElementById.mock.calls.length;
        const status = { textContent: '', className: '', setAttribute: vi.fn() };
        const input = {
            checked: true,
            disabled: false,
            isConnected: true,
            dataset: { assignmentId: 'lesson-1', savedGradeable: 'false' },
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
            closest: () => ({ querySelector: () => status })
        };

        await expect(toggleAssignmentGradeable('lesson-1', true, input)).resolves.toBe(true);

        expect(requests[0]).toMatchObject({
            table: 'assignments',
            action: 'select',
            columns: '*',
            filters: [{ column: 'course_id', value: 'course-1' }]
        });
        expect(requests[1]).toMatchObject({
            table: 'assignments',
            action: 'update',
            payload: { is_gradeable: true },
            filters: [{ column: 'id', value: 'lesson-1' }]
        });
        expect(requests).toHaveLength(2);
        expect(assignment.is_gradeable).toBe(true);
        expect(input.dataset.savedGradeable).toBe('true');
        expect(input.checked).toBe(true);
        expect(input.isConnected).toBe(true);
        expect(status.textContent).toBe('Included in Grades.');
        expect(status.setAttribute).toHaveBeenCalledWith('role', 'status');
        expect(status.setAttribute).toHaveBeenCalledWith('aria-live', 'polite');
        expect(assignmentList.innerHTML).toBe(renderedPage);
        expect(getElementById).toHaveBeenCalledTimes(domReadCount);
        expect(input.disabled).toBe(false);
        expect(input.removeAttribute).toHaveBeenCalledWith('aria-busy');
    });

    it('restores the prior checkbox state and announces save failures', async () => {
        vi.spyOn(supabaseClient, 'from').mockImplementation(() => {
            const query = {
                update: () => query,
                eq: () => query,
                select: () => query,
                maybeSingle: () => query,
                then(resolve, reject) {
                    return Promise.resolve({ data: null, error: new Error('permission denied') }).then(resolve, reject);
                }
            };
            return query;
        });
        const status = { textContent: '', className: '', setAttribute: vi.fn() };
        const input = {
            checked: true,
            disabled: false,
            dataset: { savedGradeable: 'false' },
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
            closest: () => ({ querySelector: () => status })
        };

        await expect(toggleAssignmentGradeable('lesson-1', true, input)).resolves.toBe(false);

        expect(input.checked).toBe(false);
        expect(input.disabled).toBe(false);
        expect(status.textContent).toContain('Could not save the Grades setting: permission denied');
        expect(status.setAttribute).toHaveBeenCalledWith('role', 'alert');
        expect(status.setAttribute).toHaveBeenCalledWith('aria-live', 'assertive');
    });
});

describe('Coursework ordering', () => {
    it('keeps curriculum order ahead of priority and database row order', () => {
        const courses = [{ id: 'course-1', code: 'BE103', pacing_type: 'weekly' }];
        const assignments = [
            { id: 'lesson-10', course_id: 'course-1', title: '↳ Lesson 10: Challenge', priority: 'high', due_date: '2026-09-20' },
            { id: 'lesson-2', course_id: 'course-1', title: '↳ Lesson 2: PATCH', priority: 'medium', due_date: '2026-09-20' },
            { id: 'lesson-1', course_id: 'course-1', title: '↳ Lesson 1: POST', priority: 'low', due_date: '2026-09-20' },
            { id: 'unit-3', course_id: 'course-1', unit_number: 3, title: 'Unit 3: Review', priority: 'high', due_date: '2026-09-20' },
            { id: 'lesson-7', course_id: 'course-1', unit_number: 3, title: '↳ Lesson 7: Create rows', priority: 'low', due_date: '2026-09-20' }
        ];

        const orderedTitles = [...assignments]
            .sort((a, b) => compareCourseworkOrder(a, b, courses))
            .map((assignment) => assignment.title);

        expect(orderedTitles).toEqual([
            '↳ Lesson 1: POST',
            '↳ Lesson 2: PATCH',
            '↳ Lesson 10: Challenge',
            'Unit 3: Review',
            '↳ Lesson 7: Create rows'
        ]);
    });

    it('uses a deterministic title and id tie-breaker when lessons share a sequence', () => {
        const assignments = [
            { id: 'b', course_id: 'course-1', title: 'Lesson 2: Beta', due_date: '2026-09-20' },
            { id: 'a', course_id: 'course-1', title: 'Lesson 2: Alpha', due_date: '2026-09-20' }
        ];

        expect([...assignments].sort((a, b) => compareCourseworkOrder(a, b)).map((item) => item.id))
            .toEqual(['a', 'b']);
    });

    it('places linked subtasks immediately after their parent', () => {
        const assignments = [
            { id: 'other', course_id: 'course-1', title: 'Another assignment' },
            { id: 'child', parent_assignment_id: 'parent', course_id: 'course-1', title: '↳ Draft outline' },
            { id: 'parent', course_id: 'course-1', title: 'Research paper' },
        ];

        const orderedIds = [...assignments].sort((a, b) => compareCourseworkOrder(a, b)).map((item) => item.id);
        expect(orderedIds.indexOf('parent')).toBeLessThan(orderedIds.indexOf('child'));
    });

    it('assigns reschedule dates in the same curriculum order', () => {
        const assignments = [
            { id: 'lesson-3', course_id: 'course-1', title: '↳ Lesson 3: Loops', priority: 'high' },
            { id: 'lesson-1', course_id: 'course-1', title: '↳ Lesson 1: Syntax', priority: 'low' },
            { id: 'lesson-2', course_id: 'course-1', title: '↳ Lesson 2: Logic', priority: 'medium' }
        ];
        const weekdays = ['2026-09-21', '2026-09-22', '2026-09-23'];

        expect(buildRescheduleUpdates(assignments, weekdays).map((update) => [update.id, update.due_date]))
            .toEqual([
                ['lesson-1', '2026-09-21'],
                ['lesson-2', '2026-09-22'],
                ['lesson-3', '2026-09-23']
        ]);
    });

    it('maps WGU, Maestro, and manual pacing profiles to existing course fields', () => {
        expect(getCoursePacingProfile({ lms_provider: 'browser_wgu' })).toBe('wgu');
        expect(getCoursePacingProfile({ lms_provider: 'browser_maestro' })).toBe('maestro');
        expect(getCoursePacingProfile({ pacing_source: 'wgu_pacing_guide' })).toBe('wgu');
        expect(getCoursePacingProfile({ pacing_type: 'weekly' })).toBe('weekly');
        expect(getCoursePacingProfile({})).toBe('manual');
        expect(getCoursePacingUpdates({}, 'wgu')).toEqual({ pacing_type: 'weekly', lms_provider: 'browser_wgu', pacing_source: 'settings' });
        expect(getCoursePacingUpdates({}, 'maestro')).toEqual({ pacing_type: 'weekly', lms_provider: 'browser_maestro', pacing_source: 'settings' });
        expect(getCoursePacingUpdates({ lms_provider: 'canvas', pacing_source: 'canvas_import' }, 'weekly')).toEqual({ pacing_type: 'weekly', lms_provider: 'canvas', pacing_source: 'canvas_import' });
        expect(getCoursePacingUpdates({ lms_provider: 'canvas' }, 'manual')).toEqual({ pacing_type: 'manual', lms_provider: 'canvas', pacing_source: null });
    });

    it('plans incomplete coursework in curriculum order across the selected date range', () => {
        const assignments = [
            { id: 'lesson-2', course_id: 'course-1', unit_number: 1, title: '↳ Lesson 2: Logic' },
            { id: 'unit-2', course_id: 'course-1', unit_number: 2, title: 'Unit 2: Review' },
            { id: 'lesson-1', course_id: 'course-1', unit_number: 1, title: '↳ Lesson 1: Syntax' }
        ];
        expect(buildSequencePlanUpdates(assignments, '2026-09-21', '2026-09-23').map((item) => [item.id, item.due_date]))
            .toEqual([
                ['lesson-1', '2026-09-21'],
                ['lesson-2', '2026-09-22'],
                ['unit-2', '2026-09-23']
            ]);
    });
});
