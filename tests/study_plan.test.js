import { describe, it, expect, beforeAll } from 'vitest';

describe('AI Study Schedule & Workload Balancer', () => {
    let generateBalancedStudyPlan;

    beforeAll(async () => {
        const mod = await import('../js/modules/studyPlan.js');
        generateBalancedStudyPlan = mod.generateBalancedStudyPlan || globalThis.generateBalancedStudyPlan;
    });

    describe('generateBalancedStudyPlan', () => {
        it('returns empty array when courses or assignments are missing', () => {
            expect(generateBalancedStudyPlan(null, null)).toEqual([]);
        });

        it('generates multi-day study schedule blocks leading up to deadlines', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'c1', code: 'CS 101', emoji: '💻', color: '#4f46e5' },
                { id: 'c2', code: 'MATH 201', emoji: '📐', color: '#10b981' }
            ];
            const assignments = [
                { id: 'a1', course_id: 'c1', title: '↳ Python Data Structures', due_date: '2026-08-22', is_completed: false },
                { id: 'a2', course_id: 'c2', title: 'Linear Algebra Midterm Exam', due_date: '2026-08-23', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, assignments, baseDate, 5);
            expect(plan.length).toBe(5);
            expect(plan[0].isToday).toBe(true);
            expect(plan[0].blocks.length).toBeGreaterThan(0);

            // Exam should receive a 50m block
            const examBlock = plan.flatMap(p => p.blocks).find(b => b.isExam);
            expect(examBlock).toBeDefined();
            expect(examBlock.durationMinutes).toBe(50);
        });
    });
});
