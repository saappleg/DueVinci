import { describe, expect, it } from 'vitest';
import { detectCanvasAssignmentChanges, getCanvasCoursesEligibleForNewAlerts } from '../supabase/functions/_shared/canvas_assignment_changes.ts';

describe('Canvas assignment change detection', () => {
    it('reports new dated assignments and due-date changes by stable Canvas id', () => {
        const changes = detectCanvasAssignmentChanges([
            { lms_source_id: 'old-1', title: 'Quiz', due_date: '2026-10-20T09:00:00Z', course_id: 'c1', course_code: 'BIO' },
        ], [
            { lms_source_id: 'old-1', title: 'Quiz', due_date: '2026-10-21T09:00:00Z', course_id: 'c1', course_code: 'BIO' },
            { lms_source_id: 'new-2', title: 'Lab report', due_date: '2026-10-22T09:00:00Z', course_id: 'c1', course_code: 'BIO' },
        ]);

        expect(changes).toEqual([
            { kind: 'due_date_changed', sourceId: 'old-1', title: 'Quiz', dueDate: '2026-10-21 09:00 UTC', previousDueDate: '2026-10-20 09:00 UTC', courseId: 'c1', courseCode: 'BIO' },
            { kind: 'new_assignment', sourceId: 'new-2', title: 'Lab report', dueDate: '2026-10-22 09:00 UTC', previousDueDate: '', courseId: 'c1', courseCode: 'BIO' },
        ]);
    });

    it('ignores stable dates, missing ids, and repeated copies in one sync', () => {
        expect(detectCanvasAssignmentChanges([
            { lms_source_id: 'a1', title: 'Reading', due_date: '2026-10-20T09:00:00Z' },
        ], [
            { lms_source_id: 'a1', title: 'Reading renamed', due_date: '2026-10-20T09:00:00.000Z' },
            { title: 'No stable source id', due_date: '2026-10-21' },
            { lms_source_id: 'a2', title: 'New item', due_date: '2026-10-22' },
            { lms_source_id: 'a2', title: 'New item duplicate', due_date: '2026-10-22' },
        ])).toEqual([{
            kind: 'new_assignment', sourceId: 'a2', title: 'New item', dueDate: '2026-10-22', previousDueDate: '', courseId: '', courseCode: '',
        }]);
    });

    it('uses the previous sync timestamp to establish a new course without requiring an earlier assignment', () => {
        const established = getCanvasCoursesEligibleForNewAlerts([
            { id: 'existing-course', created_at: '2026-10-01T10:00:00Z' },
            { id: 'new-course', created_at: '2026-10-15T11:00:00Z' },
        ], '2026-10-15T10:30:00Z');
        expect(established.has('existing-course')).toBe(true);
        expect(established.has('new-course')).toBe(false);
        expect(getCanvasCoursesEligibleForNewAlerts([{ id: 'first-sync', created_at: '2026-10-01T10:00:00Z' }], null).size).toBe(0);
    });
});
