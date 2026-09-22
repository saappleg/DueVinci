import { describe, expect, it } from 'vitest';
import { buildRescheduleUpdates, compareCourseworkOrder } from '../js/modules/courses.js';

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
});
