import { describe, expect, it } from 'vitest';
import { buildTermRolloverCoursePayload, suggestNextTermName } from '../js/modules/termRollover.js';

describe('Term rollover', () => {
    it('suggests the next academic season and avoids an existing name', () => {
        expect(suggestNextTermName('Fall 2026')).toBe('Spring 2027');
        expect(suggestNextTermName('Spring 2027')).toBe('Summer 2027');
        expect(suggestNextTermName('Fall 2026', ['Spring 2027'])).toBe('Spring 2027 (2)');
    });

    it('copies class shells into the new term without carrying old work or LMS identities', () => {
        expect(buildTermRolloverCoursePayload([{
            id: 'old-course', user_id: 'old-user', code: 'BIO 101', name: 'Biology', emoji: '🧬', color: '#123456',
            term: 'Fall 2026', start_date: '2026-08-01', end_date: '2026-12-20', is_completed: true,
            lms_provider: 'canvas', lms_source_id: 'canvas-8', pacing_type: 'weekly', pacing_source: 'old-import',
        }], 'user-2', 'Spring 2027')).toEqual([{
            user_id: 'user-2', name: 'Biology', code: 'BIO 101', emoji: '🧬', color: '#123456', term: 'Spring 2027',
            start_date: null, end_date: null, is_completed: false, pacing_type: 'weekly', pacing_source: null,
            lms_provider: null, lms_source_id: null,
            rollover_source_course_id: 'old-course',
        }]);
    });

    it('requires a user and a valid destination term', () => {
        expect(() => buildTermRolloverCoursePayload([], null, 'Spring 2027')).toThrow('sign in');
        expect(() => buildTermRolloverCoursePayload([], 'user-1', '')).toThrow('name');
    });
});
