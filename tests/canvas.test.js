import { describe, expect, it } from 'vitest';
import { buildCanvasCoursePayload } from '../js/modules/canvas.js';

describe('Canvas course imports', () => {
    it('maps Canvas courses to the fields rendered by the current course UI', () => {
        const payload = buildCanvasCoursePayload(
            { id: 42, name: 'Discrete Mathematics', course_code: 'MATH 215' },
            'user-123',
            '2026-08-23T12:00:00.000Z'
        );

        expect(payload).toMatchObject({
            user_id: 'user-123',
            name: 'Discrete Mathematics',
            code: 'MATH 215',
            emoji: '📚',
            lms_source_id: '42',
            lms_provider: 'canvas',
            updated_at: '2026-08-23T12:00:00.000Z'
        });
        expect(payload.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('uses the Canvas course name when Canvas does not provide a course code', () => {
        const payload = buildCanvasCoursePayload({ id: 'abc', name: 'Writing Seminar' }, 'user-123');

        expect(payload.code).toBe('Writing Seminar');
    });
});
