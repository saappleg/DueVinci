import { describe, expect, it } from 'vitest';
import { renderGradeControlInputs } from '../js/modules/grades.js';

describe('grade entry controls', () => {
    it('names the assignment and gives grade and exclusion controls 44px targets', () => {
        const controls = renderGradeControlInputs({
            item: { id: 'grade-1', title: 'Unit 1: <Exam>', exclude_from_gpa: true },
            course: { id: 'course-2', code: 'BIO101' },
            activeGrade: 92,
            isSimulatingGrades: false,
            isSimulatedVal: false
        });

        expect(controls).toContain('aria-label="Exclude BIO101 Unit 1: &lt;Exam&gt; from GPA"');
        expect(controls).toContain('checked');
        expect(controls).toContain('aria-label="BIO101 Unit 1: &lt;Exam&gt; grade"');
        expect(controls).toContain('value="92"');
        expect(controls).toContain('min-h-11 min-w-11');
        expect(controls).toContain('min-h-11 w-16');
        expect(controls).toContain('data-course-id="course-2"');
    });
});
