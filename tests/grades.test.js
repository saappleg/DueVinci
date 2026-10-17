import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../js/modules/config.js', () => ({ supabaseClient: { from: mocks.from } }));
import {
    calculateCourseAverage,
    calculateCreditWeightedGpa,
    calculateRequiredAssessmentScore,
    calculateTermInsights,
    filterGradePageData,
    getCourseCreditHours,
    getGradeCategories,
    isGradebookAssignment,
    loadGradesPage,
    renderGradeControlInputs,
    updateAssignmentGrade
} from '../js/modules/grades.js';

afterEach(() => {
    mocks.from.mockReset();
    vi.unstubAllGlobals();
});

describe('grade entry controls', () => {
    it('names the assignment and gives grade and exclusion controls 44px targets', () => {
        const controls = renderGradeControlInputs({
            item: { id: 'grade-1', title: 'Unit 1: <Exam>', grade: 92, exclude_from_gpa: true },
            course: { id: 'course-2', code: 'BIO101' },
            activeGrade: 92,
            isSimulatingGrades: false,
            isSimulatedVal: false
        });

        expect(controls).toContain('aria-label="Exclude BIO101 Unit 1: &lt;Exam&gt; from GPA"');
        expect(controls).toContain('checked');
        expect(controls).toContain('aria-label="BIO101 Unit 1: &lt;Exam&gt; grade"');
        expect(controls).toContain('value="92"');
        expect(controls).toContain('data-saved-grade="92"');
        expect(controls).toContain('min-h-11 min-w-11');
        expect(controls).toContain('min-h-11 w-16');
        expect(controls).toContain('data-course-id="course-2"');
    });

    it('restores the last saved grade and recalculates summaries when saving a grade fails', async () => {
        const status = { textContent: '', className: '', setAttribute: vi.fn() };
        const average = { textContent: '' };
        const cumulativeGpa = { textContent: '' };
        const gradeInput = { value: '95', dataset: { assignmentId: 'grade-1', savedGrade: '80' } };
        const row = {
            querySelector(selector) {
                if (selector === '[data-sim-grade-input]') return gradeInput;
                if (selector === '[data-grade-category]') return { value: 'coursework' };
                if (selector === '[data-grade-exclude]') return { checked: false };
                return null;
            }
        };
        const courseCard = {
            dataset: { gradeCategories: '[{"id":"coursework","name":"Coursework","weight":100}]', creditHours: '3' },
            querySelectorAll: () => [row],
            querySelector(selector) {
                if (selector === '[data-course-average]') return average;
                if (selector === '[data-grade-course-status]') return status;
                return null;
            }
        };
        gradeInput.closest = () => courseCard;
        const gradesContainer = { querySelectorAll: () => [courseCard] };
        vi.stubGlobal('document', {
            getElementById(id) {
                if (id === 'gradesContainer') return gradesContainer;
                if (id === 'cumulativeGpaVal') return cumulativeGpa;
                return null;
            }
        });
        const eq = vi.fn().mockResolvedValue({ error: new Error('offline') });
        mocks.from.mockReturnValue({ update: () => ({ eq }) });

        await updateAssignmentGrade('grade-1', '95', gradeInput);

        expect(gradeInput.value).toBe('80');
        expect(gradeInput.dataset.savedGrade).toBe('80');
        expect(average.textContent).toBe('Course Average: 80.0%');
        expect(cumulativeGpa.textContent).toBe('3.20 / 4.0');
        expect(status.textContent).toContain('Could not save grade: offline');
        expect(status.setAttribute).toHaveBeenCalledWith('role', 'alert');
        expect(eq).toHaveBeenCalledWith('id', 'grade-1');
    });
});

describe('gradebook visibility', () => {
    it('explains when hiding completed classes removes every course from Grades', async () => {
        const gradesContainer = { innerHTML: '', querySelectorAll: () => [] };
        const cumulativeGpa = { textContent: '' };
        let courses = [];
        let hideCompleted = true;
        vi.stubGlobal('document', {
            getElementById(id) {
                if (id === 'gradesContainer') return gradesContainer;
                if (id === 'cumulativeGpaVal') return cumulativeGpa;
                return null;
            }
        });
        vi.stubGlobal('localStorage', {
            getItem(key) {
                return key === 'duevinci_hide_completed_courses' && hideCompleted ? 'true' : null;
            }
        });
        mocks.from.mockImplementation((table) => ({
            select: vi.fn().mockResolvedValue({
                data: table === 'courses' ? courses : [],
                error: null
            })
        }));

        await loadGradesPage();
        expect(gradesContainer.innerHTML).toContain('Add a course to start tracking grades.');

        courses = [{ id: 'completed-course', is_completed: true }];
        await loadGradesPage();
        expect(gradesContainer.innerHTML).toContain('All courses are hidden because they’re marked complete.');
        expect(gradesContainer.innerHTML).toContain('Turn off “Hide completed classes” in Settings');
        expect(gradesContainer.innerHTML).not.toContain('Add a course to start tracking grades.');

        courses = [];
        hideCompleted = false;
        await loadGradesPage();
        expect(gradesContainer.innerHTML).toContain('Add a course to start tracking grades.');
    });

    it('uses explicit gradeability and preserves only legacy items with saved gradebook data', () => {
        expect(isGradebookAssignment({ is_gradeable: true, title: 'Lesson 1' })).toBe(true);
        expect(isGradebookAssignment({
            is_gradeable: false,
            title: 'Final exam',
            grade: 95,
            grade_category_id: 'exams',
            lms_provider: 'canvas'
        })).toBe(false);
        expect(isGradebookAssignment({ grade: 84 })).toBe(true);
        expect(isGradebookAssignment({ grade_category_id: 'coursework' })).toBe(true);
        expect(isGradebookAssignment({ title: 'Lesson 1', task_type: 'lesson', lms_provider: 'canvas' })).toBe(false);
        expect(isGradebookAssignment({ grade: 'not-a-grade', grade_category_id: '' })).toBe(false);
    });

    it('removes completed courses and their gradeable items when the preference is enabled', () => {
        const courses = [
            { id: 'active-course', is_completed: false },
            { id: 'completed-course', is_completed: true }
        ];
        const assignments = [
            { id: 'active-grade', course_id: 'active-course', is_gradeable: true, grade: 90 },
            { id: 'active-ungraded', course_id: 'active-course', is_gradeable: false, grade: null },
            { id: 'completed-grade', course_id: 'completed-course', is_gradeable: true, grade: 80 },
            { id: 'orphan-grade', course_id: 'missing-course', is_gradeable: true, grade: 75 }
        ];

        expect(filterGradePageData(courses, assignments, true)).toEqual({
            courses: [courses[0]],
            assignments: [assignments[0]]
        });
        expect(filterGradePageData(courses, assignments, false)).toEqual({
            courses,
            assignments: [assignments[0], assignments[2]]
        });
    });
});

describe('weighted grade calculations', () => {
    const course = {
        grade_categories: [
            { id: 'coursework', name: 'Coursework', weight: 60 },
            { id: 'exams', name: 'Exams', weight: 40 }
        ]
    };

    it('weights category averages and excludes empty or excluded grades', () => {
        const assignments = [
            { id: 'a1', grade: 80, grade_category_id: 'coursework' },
            { id: 'a2', grade: 90, grade_category_id: 'coursework' },
            { id: 'e1', grade: 70, grade_category_id: 'exams' },
            { id: 'e2', grade: null, grade_category_id: 'exams' },
            { id: 'x1', grade: 100, grade_category_id: 'exams', exclude_from_gpa: true }
        ];

        expect(calculateCourseAverage(assignments, course)).toBeCloseTo(79, 8);
    });

    it('normalizes categories with graded work and safely falls back for malformed configuration', () => {
        expect(calculateCourseAverage([
            { id: 'e1', grade: 80, grade_category_id: 'exams' }
        ], course)).toBe(80);
        expect(getGradeCategories({ grade_categories: [{ id: 'bad', name: 'Exams', weight: 60 }] }))
            .toEqual([{ id: 'coursework', name: 'Coursework', weight: 100 }]);
        expect(calculateCourseAverage([{ id: 'a1', grade: 87 }], {})).toBe(87);
        expect(calculateCourseAverage([{ id: 'a1', grade: 105 }], {})).toBeNull();
    });

    it('applies simulated grades without changing the saved assignment object', () => {
        const assignments = [{ id: 'a1', grade: 70 }];
        expect(calculateCourseAverage(assignments, {}, { a1: 95 })).toBe(95);
        expect(assignments[0].grade).toBe(70);
    });
});

describe('credit-weighted GPA', () => {
    it('weights each course GPA by its credit hours on the selected scale', () => {
        const gpa = calculateCreditWeightedGpa([
            { averagePercent: 90, creditHours: 3 },
            { averagePercent: 80, creditHours: 1 }
        ], 4);

        expect(gpa).toBeCloseTo(3.5, 8);
    });

    it('uses the three-credit default for existing courses and ignores courses without grades', () => {
        expect(getCourseCreditHours({})).toBe(3);
        expect(calculateCreditWeightedGpa([
            { averagePercent: 100, creditHours: 3 },
            { averagePercent: null, creditHours: 1 }
        ], 5)).toBe(5);
        expect(calculateCreditWeightedGpa([], 4)).toBeNull();
    });
});

describe('target-score calculator', () => {
    const course = {
        grade_categories: [
            { id: 'coursework', name: 'Coursework', weight: 70 },
            { id: 'exams', name: 'Exams', weight: 30 }
        ]
    };

    it('solves for the next equally weighted item in a graded category', () => {
        const result = calculateRequiredAssessmentScore({
            assignments: [
                { id: 'a1', grade: 80, grade_category_id: 'coursework' },
                { id: 'e1', grade: 90, grade_category_id: 'exams' }
            ],
            course,
            targetPercent: 82,
            categoryId: 'exams'
        });

        expect(result.status).toBe('possible');
        expect(result.required).toBeCloseTo(83.3333333333, 8);
    });

    it('supports a category with no current grade and reports unreachable targets', () => {
        const assignments = [{ id: 'a1', grade: 80, grade_category_id: 'coursework' }];
        const attainable = calculateRequiredAssessmentScore({
            assignments, course, targetPercent: 82, categoryId: 'exams'
        });
        const unreachable = calculateRequiredAssessmentScore({
            assignments, course, targetPercent: 100, categoryId: 'exams'
        });

        expect(attainable.status).toBe('possible');
        expect(attainable.required).toBeCloseTo(86.6666666667, 8);
        expect(unreachable.status).toBe('unreachable');
        expect(unreachable.required).toBeGreaterThan(100);
    });

    it('handles excluded work, achieved targets, zero-weight categories, and invalid targets', () => {
        expect(calculateRequiredAssessmentScore({
            assignments: [{ id: 'a1', grade: 100, grade_category_id: 'coursework', exclude_from_gpa: true }],
            course, targetPercent: 90, categoryId: 'coursework'
        }).required).toBeCloseTo(90, 8);
        expect(calculateRequiredAssessmentScore({
            assignments: [{ id: 'a1', grade: 95, grade_category_id: 'coursework' }],
            course, targetPercent: 20, categoryId: 'coursework'
        }).status).toBe('already-met');
        expect(calculateRequiredAssessmentScore({
            assignments: [], course: { grade_categories: [
                { id: 'zero', name: 'Zero', weight: 0 },
                { id: 'work', name: 'Coursework', weight: 100 }
            ] },
            targetPercent: 80, categoryId: 'zero'
        }).status).toBe('zero-weight');
        expect(calculateRequiredAssessmentScore({
            assignments: [], course, targetPercent: 101, categoryId: 'exams'
        }).status).toBe('invalid-target');
    });
});

describe('term insights', () => {
    const now = Date.parse('2026-10-16T12:00:00.000Z');

    it('compares equally counted, saved grade snapshots by due-date order inside the rolling window', () => {
        const insights = calculateTermInsights({
            now,
            assignments: [
                { grade: 60, due_date: '2026-07-20' },
                { grade: 70, due_date: '2026-07-25' },
                { grade: 80, due_date: '2026-08-03' },
                { grade: 90, due_date: '2026-09-01' },
                { grade: 90, due_date: '2026-09-05' },
                { grade: 100, due_date: '2026-10-01' },
                { grade: 100, due_date: '2026-10-02', exclude_from_gpa: true },
                { grade: 0, due_date: '2026-10-17' },
                { grade: 100, due_date: '2026-07-01' },
                { grade: 85, due_date: 'not-a-date' }
            ]
        });

        expect(insights.gradeTrend.status).toBe('ready');
        expect(insights.gradeTrend.gradedItemCount).toBe(6);
        expect(insights.gradeTrend.earlierAverage).toBe(70);
        expect(insights.gradeTrend.laterAverage).toBeCloseTo(93.3333333333, 8);
        expect(insights.gradeTrend.direction).toBe('higher');
        expect(insights.focus.status).toBe('disabled');
    });

    it('requires six dated grades and reports insufficient focus history without exposing raw sessions', () => {
        const insights = calculateTermInsights({
            now,
            assignments: [
                { grade: 90, due_date: '2026-10-01' },
                { grade: 80, due_date: '2026-10-02' }
            ],
            studyHistory: { sessions: [{ minutes: 25, recordedAt: '2026-10-12T10:00:00.000Z' }] }
        });

        expect(insights.gradeTrend).toMatchObject({ status: 'insufficient', gradedItemCount: 2, minimumItems: 6 });
        expect(insights.focus).toMatchObject({ status: 'insufficient', sessionCount: 1, activeDayCount: 1 });
        expect(insights.focus).not.toHaveProperty('sessions');
    });

    it('summarizes valid focus sessions only after the minimum sample across two days', () => {
        const insights = calculateTermInsights({
            now,
            studyHistory: {
                sessions: [
                    { minutes: 25, recordedAt: '2026-10-12T10:00:00.000Z' },
                    { minutes: 50, recordedAt: '2026-10-13T12:00:00.000Z' },
                    { minutes: 25, recordedAt: '2026-10-13T15:00:00.000Z' },
                    { minutes: 240, recordedAt: '2026-07-01T10:00:00.000Z' },
                    { minutes: 241, recordedAt: '2026-10-14T10:00:00.000Z' },
                    { minutes: 25, recordedAt: '2026-10-17T10:00:00.000Z' }
                ]
            }
        });

        expect(insights.focus.status).toBe('ready');
        expect(insights.focus.sessionCount).toBe(3);
        expect(insights.focus.activeDayCount).toBe(2);
        expect(insights.focus.totalMinutes).toBe(100);
        expect(insights.focus.averageMinutes).toBeCloseTo(100 / 3, 8);
        expect(insights.focus.mostActiveWeekday).toBe('Tuesday');
    });
});
