import { describe, it, expect, beforeAll } from 'vitest';

describe('AI Study Schedule & Workload Balancer', () => {
    let generateBalancedStudyPlan;
    let ensureStudyPlanDayModalExists;
    let closeStudyPlanDayModal;
    let startStudyPlanTimer;

    beforeAll(async () => {
        const mod = await import('../js/modules/studyPlan.js');
        generateBalancedStudyPlan = mod.generateBalancedStudyPlan || globalThis.generateBalancedStudyPlan;
        ensureStudyPlanDayModalExists = mod.ensureStudyPlanDayModalExists || globalThis.ensureStudyPlanDayModalExists;
        closeStudyPlanDayModal = mod.closeStudyPlanDayModal || globalThis.closeStudyPlanDayModal;
        startStudyPlanTimer = mod.startStudyPlanTimer || globalThis.startStudyPlanTimer;
    });

    describe('generateBalancedStudyPlan', () => {
        it('returns empty array when courses or assignments are missing', () => {
            expect(generateBalancedStudyPlan(null, null)).toEqual([]);
        });

        it('generates multi-day study schedule blocks leading up to deadlines with allBlocks and recommendations', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'c1', code: 'CS 101', name: 'Intro to Computer Science', emoji: '💻', color: '#4f46e5' },
                { id: 'c2', code: 'MATH 201', name: 'Linear Algebra', emoji: '📐', color: '#10b981' }
            ];
            const assignments = [
                { id: 'a1', course_id: 'c1', title: '↳ Python Data Structures', due_date: '2026-08-22', is_completed: false },
                { id: 'a2', course_id: 'c2', title: 'Linear Algebra Midterm Exam', due_date: '2026-08-23', is_completed: false },
                { id: 'a3', course_id: 'c1', title: 'Reading Chapter 4: Big O Notation', due_date: '2026-08-24', is_completed: false },
                { id: 'a4', course_id: 'c1', title: 'Lab Assignment 2: Binary Search Trees', due_date: '2026-08-24', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, assignments, baseDate, 5);
            expect(plan.length).toBe(5);
            expect(plan[0].isToday).toBe(true);
            expect(plan[0].fullDate).toBeDefined();
            expect(plan[0].blocks.length).toBeGreaterThan(0);
            expect(plan[0].allBlocks.length).toBeGreaterThanOrEqual(plan[0].blocks.length);

            // Check that allBlocks has rich study plan details
            const examBlock = plan.flatMap(p => p.allBlocks).find(b => b.isExam);
            expect(examBlock).toBeDefined();
            expect(examBlock.durationMinutes).toBe(50);
            expect(examBlock.recommendation).toContain('Active recall');
            expect(examBlock.dueText).toBeDefined();

            // Reading block recommendation check
            const readingBlock = plan.flatMap(p => p.allBlocks).find(b => b.title.includes('Chapter 4'));
            if (readingBlock) {
                expect(readingBlock.recommendation).toContain('Synthesize key definitions');
            }
        });
    });

    describe('Modal and Timer Helpers', () => {
        it('exports modal and timer launcher functions safely', () => {
            expect(typeof ensureStudyPlanDayModalExists).toBe('function');
            expect(typeof closeStudyPlanDayModal).toBe('function');
            expect(typeof startStudyPlanTimer).toBe('function');
            
            // Calling them in non-DOM/node environment should not throw
            expect(() => ensureStudyPlanDayModalExists()).not.toThrow();
            expect(() => closeStudyPlanDayModal()).not.toThrow();
            expect(() => startStudyPlanTimer(25, 'Test Block')).not.toThrow();
        });
    });
});

