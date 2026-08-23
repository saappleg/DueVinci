import { describe, it, expect, beforeAll } from 'vitest';

describe('AI Study Schedule & Workload Balancer', () => {
    let generateBalancedStudyPlan;
    let getUnitNumber;
    let getLessonNumber;
    let ensureStudyPlanDayModalExists;
    let closeStudyPlanDayModal;
    let startStudyPlanTimer;

    beforeAll(async () => {
        const mod = await import('../js/modules/studyPlan.js');
        generateBalancedStudyPlan = mod.generateBalancedStudyPlan || globalThis.generateBalancedStudyPlan;
        getUnitNumber = mod.getUnitNumber || globalThis.getUnitNumber;
        getLessonNumber = mod.getLessonNumber || globalThis.getLessonNumber;
        ensureStudyPlanDayModalExists = mod.ensureStudyPlanDayModalExists || globalThis.ensureStudyPlanDayModalExists;
        closeStudyPlanDayModal = mod.closeStudyPlanDayModal || globalThis.closeStudyPlanDayModal;
        startStudyPlanTimer = mod.startStudyPlanTimer || globalThis.startStudyPlanTimer;
    });

    describe('getUnitNumber and getLessonNumber Helpers', () => {
        it('extracts unit numbers from property and strings accurately', () => {
            expect(getUnitNumber({ unit_number: 3, title: 'Functions' })).toBe(3);
            expect(getUnitNumber({ title: 'Unit 2: Data Structures' })).toBe(2);
            expect(getUnitNumber({ title: 'Week 5: Algorithmic Complexity' })).toBe(5);
            expect(getUnitNumber({ title: 'Module 4: Databases' })).toBe(4);
            expect(getUnitNumber('Wk 1: Getting Started')).toBe(1);
            expect(getUnitNumber({ title: 'General Assignment' })).toBe(0);
        });

        it('extracts lesson numbers from titles and strings in proper sequential format', () => {
            expect(getLessonNumber({ lesson_number: 1, title: 'Intro' })).toBe(1);
            expect(getLessonNumber({ title: 'Lesson 1: Intro to Python' })).toBe(1);
            expect(getLessonNumber({ title: '↳ Lesson 2: Conditionals' })).toBe(2);
            expect(getLessonNumber({ title: '↳ Lesson 3: Iteration & Loops' })).toBe(3);
            expect(getLessonNumber({ title: '↳ Lesson 4: Functions & Scope' })).toBe(4);
            expect(getLessonNumber({ title: '↳ 1. Quickstart' })).toBe(1);
            expect(getLessonNumber({ title: '↳ Part 2: Working with Arrays' })).toBe(2);
            expect(getLessonNumber({ title: '↳ Step 3: Binary Trees' })).toBe(3);
            expect(getLessonNumber({ title: '↳ Sec 4: Dynamic Programming' })).toBe(4);
            expect(getLessonNumber({ title: 'Midterm Exam Review' })).toBe(999);
        });
    });

    describe('generateBalancedStudyPlan', () => {
        it('returns empty array when courses or assignments are missing', () => {
            expect(generateBalancedStudyPlan(null, null)).toEqual([]);
        });

        it('enforces proper unit lesson organization and strict sequential order (Lesson 1 -> Lesson 2 -> Lesson 3 -> Lesson 4)', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'c1', code: 'CS 101', name: 'Computer Science', emoji: '💻', color: '#4f46e5' }
            ];

            // Provide assignments in jumbled / out-of-order sequence with same due date
            const jumbledAssignments = [
                { id: 'a4', course_id: 'c1', unit_number: 1, title: '↳ Lesson 4: Object-Oriented Design', due_date: '2026-08-21', is_completed: false },
                { id: 'a2', course_id: 'c1', unit_number: 1, title: '↳ Lesson 2: Control Flow', due_date: '2026-08-21', is_completed: false },
                { id: 'a1', course_id: 'c1', unit_number: 1, title: '↳ Lesson 1: Syntax & Variables', due_date: '2026-08-21', is_completed: false },
                { id: 'a3', course_id: 'c1', unit_number: 1, title: '↳ Lesson 3: Functions & Modules', due_date: '2026-08-21', is_completed: false },
                { id: 'u1', course_id: 'c1', unit_number: 1, title: 'Unit 1: Programming Fundamentals', due_date: '2026-08-21', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, jumbledAssignments, baseDate, 3);
            const day1Blocks = plan[0].allBlocks;

            expect(day1Blocks.length).toBe(5);

            // Parent Unit 1 header should be first
            expect(day1Blocks[0].title).toBe('Unit 1: Programming Fundamentals');
            expect(day1Blocks[0].unitNumber).toBe(1);

            // Sub-lessons must strictly follow Lesson 1 -> 2 -> 3 -> 4 order
            expect(day1Blocks[1].title).toBe('Lesson 1: Syntax & Variables');
            expect(day1Blocks[1].lessonNumber).toBe(1);
            expect(day1Blocks[1].unitBadgeText).toBe('Unit 1');
            expect(day1Blocks[1].lessonBadgeText).toBe('Lesson 1');
            expect(day1Blocks[1].recommendation).toContain('Foundational concepts');

            expect(day1Blocks[2].title).toBe('Lesson 2: Control Flow');
            expect(day1Blocks[2].lessonNumber).toBe(2);
            expect(day1Blocks[2].recommendation).toContain('Sequential mastery for Lesson 2');

            expect(day1Blocks[3].title).toBe('Lesson 3: Functions & Modules');
            expect(day1Blocks[3].lessonNumber).toBe(3);
            expect(day1Blocks[3].recommendation).toContain('Sequential mastery for Lesson 3');

            expect(day1Blocks[4].title).toBe('Lesson 4: Object-Oriented Design');
            expect(day1Blocks[4].lessonNumber).toBe(4);
            expect(day1Blocks[4].recommendation).toContain('Advanced unit synthesis for Lesson 4');
        });

        it('organizes multi-unit courses sequentially (Unit 1 before Unit 2)', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'c1', code: 'MATH 101', name: 'Calculus I', emoji: '📐', color: '#10b981' }
            ];

            const multiUnitAssignments = [
                { id: 'u2l1', course_id: 'c1', unit_number: 2, title: '↳ Lesson 1: Derivatives', due_date: '2026-08-21', is_completed: false },
                { id: 'u1l2', course_id: 'c1', unit_number: 1, title: '↳ Lesson 2: Limit Laws', due_date: '2026-08-21', is_completed: false },
                { id: 'u1l1', course_id: 'c1', unit_number: 1, title: '↳ Lesson 1: Introduction to Limits', due_date: '2026-08-21', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, multiUnitAssignments, baseDate, 3);
            const titles = plan[0].allBlocks.map(b => b.title);

            expect(titles).toEqual([
                'Lesson 1: Introduction to Limits',
                'Lesson 2: Limit Laws',
                'Lesson 1: Derivatives'
            ]);
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

        it('prioritizes overdue tasks on Today and parses ISO timestamps cleanly', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'c1', code: 'CS 101', name: 'Computer Science', emoji: '💻', color: '#4f46e5' }
            ];
            const assignments = [
                { id: 'a1', course_id: 'c1', title: '↳ Overdue Lab', due_date: '2026-08-18T14:30:00Z', is_completed: false },
                { id: 'a2', course_id: 'c1', title: '↳ Future Lesson', due_date: '2026-08-22', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, assignments, baseDate, 3);
            const todayBlocks = plan[0].allBlocks;

            expect(todayBlocks.length).toBe(2);
            expect(todayBlocks[0].title).toBe('Overdue Lab');
            expect(todayBlocks[0].dueText).toContain('Overdue');
        });

        it('distributes multi-lesson units evenly across days leading up to deadline instead of dumping everything on Day 0', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'c1', code: 'CS 101', name: 'Computer Science', emoji: '💻', color: '#4f46e5' }
            ];
            // 4 lessons due in 4 days (Aug 24)
            const assignments = [
                { id: 'u1', course_id: 'c1', unit_number: 1, title: 'Unit 1: Fundamentals', due_date: '2026-08-24', is_completed: false },
                { id: 'l1', course_id: 'c1', unit_number: 1, title: '↳ Lesson 1: Syntax', due_date: '2026-08-24', is_completed: false },
                { id: 'l2', course_id: 'c1', unit_number: 1, title: '↳ Lesson 2: Logic', due_date: '2026-08-24', is_completed: false },
                { id: 'l3', course_id: 'c1', unit_number: 1, title: '↳ Lesson 3: Loops', due_date: '2026-08-24', is_completed: false },
                { id: 'l4', course_id: 'c1', unit_number: 1, title: '↳ Lesson 4: OOP', due_date: '2026-08-24', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, assignments, baseDate, 5);
            expect(plan.length).toBe(5);

            // Day 0 (Aug 20) should have Lesson 1
            expect(plan[0].allBlocks.map(b => b.title)).toContain('Lesson 1: Syntax');
            // Day 1 (Aug 21) should have Lesson 2
            expect(plan[1].allBlocks.map(b => b.title)).toContain('Lesson 2: Logic');
            // Day 2 (Aug 22) should have Lesson 3
            expect(plan[2].allBlocks.map(b => b.title)).toContain('Lesson 3: Loops');
            // Day 3 (Aug 23) should have Lesson 4
            expect(plan[3].allBlocks.map(b => b.title)).toContain('Lesson 4: OOP');
            // Day 4 (Aug 24, deadline day) should have Unit 1 deliverable
            expect(plan[4].allBlocks.some(b => b.title.includes('Unit 1: Fundamentals'))).toBe(true);

            // Day 0 should NOT be overloaded with all 5 items
            expect(plan[0].allBlocks.length).toBe(1);
        });

        it('progresses strictly lesson by lesson through Unit 1 before starting Unit 2, and pairs different subjects together on each day', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'cs', code: 'CS 101', name: 'Computer Science', emoji: '💻', color: '#4f46e5' },
                { id: 'math', code: 'MATH 101', name: 'Calculus', emoji: '📐', color: '#10b981' }
            ];

            const assignments = [
                // CS 101: Unit 1 (2 lessons), Unit 2 (2 lessons)
                { id: 'cs_u1_l1', course_id: 'cs', unit_number: 1, title: '↳ CS Lesson 1: Syntax', due_date: '2026-08-26', is_completed: false },
                { id: 'cs_u1_l2', course_id: 'cs', unit_number: 1, title: '↳ CS Lesson 2: Logic', due_date: '2026-08-26', is_completed: false },
                { id: 'cs_u2_l1', course_id: 'cs', unit_number: 2, title: '↳ CS Lesson 1: Functions', due_date: '2026-08-26', is_completed: false },
                { id: 'cs_u2_l2', course_id: 'cs', unit_number: 2, title: '↳ CS Lesson 2: Recursion', due_date: '2026-08-26', is_completed: false },

                // MATH 101: Unit 1 (2 lessons), Unit 2 (2 lessons)
                { id: 'm_u1_l1', course_id: 'math', unit_number: 1, title: '↳ Math Lesson 1: Limits', due_date: '2026-08-26', is_completed: false },
                { id: 'm_u1_l2', course_id: 'math', unit_number: 1, title: '↳ Math Lesson 2: Continuity', due_date: '2026-08-26', is_completed: false },
                { id: 'm_u2_l1', course_id: 'math', unit_number: 2, title: '↳ Math Lesson 1: Derivatives', due_date: '2026-08-26', is_completed: false },
                { id: 'm_u2_l2', course_id: 'math', unit_number: 2, title: '↳ Math Lesson 2: Chain Rule', due_date: '2026-08-26', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, assignments, baseDate, 5);

            // Day 0: CS Unit 1 Lesson 1 + Math Unit 1 Lesson 1 (different subjects combined, Unit 1 only!)
            const day0Titles = plan[0].allBlocks.map(b => b.title);
            expect(day0Titles).toContain('CS Lesson 1: Syntax');
            expect(day0Titles).toContain('Math Lesson 1: Limits');
            expect(day0Titles).not.toContain('CS Lesson 1: Functions'); // Unit 2 must NOT be in Day 0

            // Day 1: CS Unit 1 Lesson 2 + Math Unit 1 Lesson 2
            const day1Titles = plan[1].allBlocks.map(b => b.title);
            expect(day1Titles).toContain('CS Lesson 2: Logic');
            expect(day1Titles).toContain('Math Lesson 2: Continuity');

            // Day 2: ONLY after finishing Unit 1 does Unit 2 start: CS Unit 2 Lesson 1 + Math Unit 2 Lesson 1
            const day2Titles = plan[2].allBlocks.map(b => b.title);
            expect(day2Titles).toContain('CS Lesson 1: Functions');
            expect(day2Titles).toContain('Math Lesson 1: Derivatives');

            // Day 3: CS Unit 2 Lesson 2 + Math Unit 2 Lesson 2
            const day3Titles = plan[3].allBlocks.map(b => b.title);
            expect(day3Titles).toContain('CS Lesson 2: Recursion');
            expect(day3Titles).toContain('Math Lesson 2: Chain Rule');
        });

        it('correctly tags assignments with priority (Urgent, Normal, Low) and type (Exam, Review, Lesson)', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'cs', code: 'CS 101', name: 'Computer Science', emoji: '💻', color: '#4f46e5' }
            ];

            const assignments = [
                { id: 'a1', course_id: 'cs', title: 'Midterm Exam Practice', task_type: 'exam', priority: 'high', due_date: '2026-08-21', is_completed: false },
                { id: 'a2', course_id: 'cs', title: 'Unit 1 Comprehensive Review', task_type: 'review', priority: 'medium', due_date: '2026-08-21', is_completed: false },
                { id: 'a3', course_id: 'cs', title: 'Optional Enrichment Reading', task_type: 'reading', priority: 'low', due_date: '2026-08-21', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, assignments, baseDate, 3);
            const blocks = plan[0].allBlocks;

            const examBlock = blocks.find(b => b.taskId === 'a1');
            expect(examBlock).toBeDefined();
            expect(examBlock.isExam).toBe(true);
            expect(examBlock.typeBadgeText).toBe('🎯 Exam');
            expect(examBlock.priority).toBe('high');
            expect(examBlock.priorityBadgeText).toBe('🔥 Urgent');
            expect(examBlock.durationMinutes).toBe(50);

            const reviewBlock = blocks.find(b => b.taskId === 'a2');
            expect(reviewBlock).toBeDefined();
            expect(reviewBlock.isReview).toBe(true);
            expect(reviewBlock.typeBadgeText).toBe('📝 Review');
            expect(reviewBlock.priority).toBe('medium');
            expect(reviewBlock.priorityBadgeText).toBe('⚡ Normal');
            expect(reviewBlock.recommendation).toContain('Unit synthesis & review');

            const readingBlock = blocks.find(b => b.taskId === 'a3');
            expect(readingBlock).toBeDefined();
            expect(readingBlock.typeBadgeText).toBe('📚 Reading');
            expect(readingBlock.priority).toBe('low');
            expect(readingBlock.priorityBadgeText).toBe('🌱 Low');
        });

        it('guarantees that all units and lessons are scheduled and finished on or before their due date', () => {
            const baseDate = new Date('2026-08-20T00:00:00Z');
            const courses = [
                { id: 'cs', code: 'CS 101', name: 'Computer Science', emoji: '💻', color: '#4f46e5' }
            ];

            // 6 lessons due in 3 days (Aug 23)
            const assignments = [
                { id: 'l1', course_id: 'cs', title: '↳ Lesson 1', due_date: '2026-08-23', is_completed: false },
                { id: 'l2', course_id: 'cs', title: '↳ Lesson 2', due_date: '2026-08-23', is_completed: false },
                { id: 'l3', course_id: 'cs', title: '↳ Lesson 3', due_date: '2026-08-23', is_completed: false },
                { id: 'l4', course_id: 'cs', title: '↳ Lesson 4', due_date: '2026-08-23', is_completed: false },
                { id: 'l5', course_id: 'cs', title: '↳ Lesson 5', due_date: '2026-08-23', is_completed: false },
                { id: 'l6', course_id: 'cs', title: '↳ Final Review Exam', task_type: 'exam', due_date: '2026-08-23', is_completed: false }
            ];

            const plan = generateBalancedStudyPlan(courses, assignments, baseDate, 7);

            // All 6 lessons must be scheduled across Day 0, Day 1, Day 2, Day 3 (before/on deadline Aug 23)
            const scheduledDays = plan.slice(0, 4); // Days 0 to 3
            const allScheduledTaskIds = scheduledDays.flatMap(d => d.assignedTasks.map(t => t.task.id));

            expect(allScheduledTaskIds).toContain('l1');
            expect(allScheduledTaskIds).toContain('l2');
            expect(allScheduledTaskIds).toContain('l3');
            expect(allScheduledTaskIds).toContain('l4');
            expect(allScheduledTaskIds).toContain('l5');
            expect(allScheduledTaskIds).toContain('l6');

            // No task should overflow past the due date (Days 4, 5, 6 should have 0 tasks from this deadline)
            expect(plan[4].assignedTasks.length).toBe(0);
            expect(plan[5].assignedTasks.length).toBe(0);

            // Verify that 'Final Review Exam' with task_type: 'exam' is properly typed as an Exam
            const examBlock = plan.flatMap(p => p.allBlocks).find(b => b.taskId === 'l6');
            expect(examBlock.isExam).toBe(true);
            expect(examBlock.typeBadgeText).toBe('🎯 Exam');
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


