// --- AI STUDY SCHEDULE & WORKLOAD BALANCER MODULE ---
import { calculateDaysRemaining, getLocalDateKey } from './academics.js';
import { supabaseClient } from './config.js';
import { escapeHtml, escapeInlineJs, fireConfetti } from './utils.js';

let cachedStudyPlan = [];
const MANUAL_PLAN_MOVES_KEY = 'duevinci_manual_study_plan_moves';
let draggedStudyPlanTaskId = null;
let studyPlanMoveNotice = '';

function getManualStudyMoves() {
    try { return JSON.parse(localStorage.getItem(MANUAL_PLAN_MOVES_KEY) || '{}'); } catch { return {}; }
}

function saveManualStudyMoves(moves) {
    try { localStorage.setItem(MANUAL_PLAN_MOVES_KEY, JSON.stringify(moves)); } catch { /* Optional local preference. */ }
}

function applyManualStudyMoves(days) {
    const moves = getManualStudyMoves();
    let changed = false;
    Object.entries(moves).forEach(([taskId, targetDate]) => {
        const source = days.find((day) => day.assignedTasks.some((entry) => entry.task.id === taskId));
        const target = days.find((day) => day.date === targetDate);
        const entry = source?.assignedTasks.find((item) => item.task.id === taskId);
        if (!source || !target || !entry || target.isRestDay || calculateDaysRemaining(entry.task.due_date, target.currentDate) < 0) {
            delete moves[taskId]; changed = true; return;
        }
        if (source !== target) {
            source.assignedTasks = source.assignedTasks.filter((item) => item.task.id !== taskId);
            target.assignedTasks.push(entry);
        }
    });
    if (changed) saveManualStudyMoves(moves);
}

function getStudyPlanBlock(taskId) {
    for (const day of cachedStudyPlan) {
        const block = day.allBlocks?.find((item) => item.taskId === taskId);
        if (block) return { block, day };
    }
    return null;
}

/** Checks whether a manual move preserves rest days, deadlines, and lesson order. */
export function getStudyPlanMoveError(taskId, targetDate) {
    const source = getStudyPlanBlock(taskId);
    const target = cachedStudyPlan.find((day) => day.date === targetDate);
    if (!source || !target) return 'That study block is no longer available. Refresh the plan and try again.';
    if (target.isRestDay) return 'Rest days are protected. Choose an active study day instead.';
    if (calculateDaysRemaining(source.block.dueDate, target.currentDate) < 0) return 'That assignment cannot be moved past its due date.';

    if (source.block.lessonNumber !== null) {
        const unitLessons = cachedStudyPlan.flatMap((day) => day.allBlocks
            .filter((block) => block.courseId === source.block.courseId
                && block.unitNumber === source.block.unitNumber
                && block.lessonNumber !== null)
            .map((block) => ({ block, date: day.date })));
        const hasEarlierLessonAfterTarget = unitLessons.some(({ block, date }) =>
            block.lessonNumber < source.block.lessonNumber && date > targetDate);
        const hasLaterLessonBeforeTarget = unitLessons.some(({ block, date }) =>
            block.lessonNumber > source.block.lessonNumber && date < targetDate);
        if (hasEarlierLessonAfterTarget || hasLaterLessonBeforeTarget) {
            return 'Keep lessons in order: move the earlier or later lesson first.';
        }
    }
    return '';
}

function rerenderStudyPlanWithNotice(message) {
    studyPlanMoveNotice = message;
    if (typeof window !== 'undefined' && typeof window.renderStudyPlanDashboardWidget === 'function') {
        return window.renderStudyPlanDashboardWidget('studyPlanWidgetContainer');
    }
    return Promise.resolve();
}

export function startStudyPlanDrag(event, taskId) {
    draggedStudyPlanTaskId = taskId;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', taskId);
    }
}

export function allowStudyPlanDrop(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

export async function dropStudyPlanBlock(event, targetDate) {
    event.preventDefault();
    event.stopPropagation();
    const taskId = event.dataTransfer?.getData('text/plain') || draggedStudyPlanTaskId;
    draggedStudyPlanTaskId = null;
    if (taskId) await moveStudyPlanBlock(taskId, targetDate);
}

export async function moveStudyPlanBlock(taskId, targetDate) {
    const error = getStudyPlanMoveError(taskId, targetDate);
    if (error) {
        await rerenderStudyPlanWithNotice(error);
        return false;
    }
    const source = getStudyPlanBlock(taskId);
    const moves = getManualStudyMoves();
    if (source.day.date === targetDate) delete moves[taskId];
    else moves[taskId] = targetDate;
    saveManualStudyMoves(moves);
    await rerenderStudyPlanWithNotice('Study block moved. Refresh keeps your manual placements.');
    return true;
}

export async function resetManualStudyPlanMoves() {
    try { localStorage.removeItem(MANUAL_PLAN_MOVES_KEY); } catch { /* Optional local preference. */ }
    await rerenderStudyPlanWithNotice('Manual placements reset to the balanced plan.');
}

/**
 * Extracts unit number from an assignment or task object.
 * @param {Object} item Assignment/task object or title string
 * @returns {number} unit number (0 if none)
 */
export function getUnitNumber(item) {
    if (!item) return 0;
    if (typeof item === 'object') {
        if (item.unit_number !== undefined && item.unit_number !== null && item.unit_number !== '') {
            const parsed = parseInt(item.unit_number, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }
    const title = typeof item === 'string' ? item : (item.title || item.rawTitle || '');
    const match = title.match(/(?:unit|wk|week|module|mod)\s*([0-9]+)/i);
    if (match) return parseInt(match[1], 10) || 0;
    return 0;
}

/**
 * Extracts lesson number from an assignment or task object for proper sequential ordering (Lesson 1, 2, 3, 4...).
 * @param {Object} item Assignment/task object or title string
 * @returns {number} lesson number (999 if unspecified)
 */
export function getLessonNumber(item) {
    if (!item) return 999;
    if (typeof item === 'object') {
        if (item.lesson_number !== undefined && item.lesson_number !== null && item.lesson_number !== '') {
            const parsed = parseInt(item.lesson_number, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }
    const title = typeof item === 'string' ? item : (item.title || item.rawTitle || '');

    // Match explicit "Lesson 1", "Lesson 2", etc.
    const lessonMatch = title.match(/lesson\s*([0-9]+)/i);
    if (lessonMatch) return parseInt(lessonMatch[1], 10) || 0;

    // Match sub-items starting with ↳ and numbers, e.g., "↳ 1. Introduction" or "↳ 1 - Concept" or "↳ 1: Concept"
    const subNumMatch = title.match(/^↳\s*([0-9]+)[\.\:\-\s]/);
    if (subNumMatch) return parseInt(subNumMatch[1], 10) || 0;

    // Match "Part 1", "Step 1", "Sec 1", "Section 1", "L1", "#1"
    const partMatch = title.match(/(?:part|step|sec|section|l|#)\s*([0-9]+)/i);
    if (partMatch) return parseInt(partMatch[1], 10) || 0;

    // If it's a sub-item (↳) with any number in title
    if (title.startsWith('↳')) {
        const numMatch = title.replace(/[^0-9]/g, '');
        if (numMatch) return parseInt(numMatch, 10) || 999;
    }

    return 999;
}

/**
 * Retrieves the user's chosen rest days (days with no scheduled coursework).
 * @returns {Array<string>} Array of day-of-week strings (e.g. ['Sun', 'Sat'])
 */
export function getRestDays() {
    try {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('duevinci_rest_days');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) return parsed;
            }
        }
    } catch (e) {
        console.warn('Error reading rest days:', e);
    }
    return [];
}

/**
 * Updates the user's rest days preference.
 * @param {Array<string>} restDays Array of day names (e.g. ['Sun', 'Sat'])
 */
export function setRestDays(restDays = []) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('duevinci_rest_days', JSON.stringify(restDays));
        }
    } catch (e) {
        console.warn('Error saving rest days:', e);
    }
    if (typeof window !== 'undefined' && typeof window.renderStudyPlanDashboardWidget === 'function') {
        window.renderStudyPlanDashboardWidget('studyPlanWidgetContainer');
    }
}

/**
 * Toggles a day of the week as a rest day.
 * @param {string} dayName Day of week abbreviation (e.g. 'Sun', 'Sat')
 * @returns {Array<string>} Updated rest days array
 */
export function toggleRestDay(dayName) {
    const current = getRestDays();
    let updated;
    if (current.includes(dayName)) {
        updated = current.filter(d => d !== dayName);
    } else {
        updated = [...current, dayName];
    }
    setRestDays(updated);
    return updated;
}

const DEFAULT_DAILY_FOCUS_CAP = 120;

function estimatedMinutes(task) {
    const type = task.task_type || task.type || '';
    return type === 'exam' || /exam|final|midterm|test/i.test(task.title || '') ? 50 : 25;
}

function taskMovePriority(task) {
    const priority = task.priority || 'medium';
    return priority === 'low' ? 2 : priority === 'high' || priority === 'urgent' ? 0 : 1;
}

/**
 * Spreads independently allocated course work without moving an item past its
 * deadline or onto a rest day. Moving later is curriculum-safe: it cannot put
 * a later lesson before an earlier one already scheduled on the source day.
 */
export function rebalanceStudyPlanAssignments(days = [], cap = DEFAULT_DAILY_FOCUS_CAP) {
    const minutesForDay = (day) => (day.assignedTasks || []).reduce((sum, entry) => sum + estimatedMinutes(entry.task), 0);
    for (let sourceIndex = 0; sourceIndex < days.length; sourceIndex++) {
        let source = days[sourceIndex];
        while (minutesForDay(source) > cap) {
            const candidates = [...source.assignedTasks]
                .map((entry, index) => ({ entry, index }))
                .sort((a, b) => {
                    const deadlineA = calculateDaysRemaining(a.entry.task.due_date, source.currentDate);
                    const deadlineB = calculateDaysRemaining(b.entry.task.due_date, source.currentDate);
                    return deadlineB - deadlineA || taskMovePriority(b.entry.task) - taskMovePriority(a.entry.task) || b.index - a.index;
                });
            let moved = false;
            for (const candidate of candidates) {
                const deadlineIndex = sourceIndex + Math.max(0, calculateDaysRemaining(candidate.entry.task.due_date, source.currentDate));
                for (let targetIndex = sourceIndex + 1; targetIndex < days.length && targetIndex <= deadlineIndex; targetIndex++) {
                    const target = days[targetIndex];
                    if (target.isRestDay || minutesForDay(target) + estimatedMinutes(candidate.entry.task) > cap) continue;
                    source.assignedTasks.splice(candidate.index, 1);
                    target.assignedTasks.push(candidate.entry);
                    moved = true;
                    break;
                }
                if (moved) break;
            }
            if (!moved) break; // Hard deadlines/rest days make the load unavoidable.
        }
    }
    return days;
}

/**
 * Calculates a balanced daily study schedule across multiple enrolled courses.
 * Enforces proper unit-lesson organization, strict sequential order, deadline-driven pacing, and rest day exclusion.
 * @param {Array} courses List of course objects
 * @param {Array} assignments List of assignment objects
 * @param {Date} startDate Starting calculation date
 * @param {number} daysAhead Number of days to project forward (default 7)
 * @param {Array|null} customRestDays Optional rest days override (e.g. ['Sun', 'Sat'])
 * @returns {Array} List of daily study plan objects
 */
export function generateBalancedStudyPlan(courses = [], assignments = [], startDate = new Date(), daysAhead = 7, customRestDays = null) {
    if (!courses || !assignments || !Array.isArray(courses) || !Array.isArray(assignments)) return [];

    const restDays = customRestDays !== null ? (Array.isArray(customRestDays) ? customRestDays : []) : getRestDays();

    let baseDate;
    if (typeof startDate === 'string') {
        const datePart = startDate.split('T')[0];
        baseDate = new Date(datePart + 'T00:00:00');
    } else if (startDate instanceof Date) {
        // Preserve the calendar date supplied by callers that use an ISO Date.
        // The resulting local-midnight Date prevents daylight-saving drift while
        // retaining the module's existing Date-input contract.
        const datePart = startDate.toISOString().split('T')[0];
        baseDate = new Date(datePart + 'T00:00:00');
    } else {
        baseDate = new Date();
        baseDate.setHours(0, 0, 0, 0);
    }

    const pendingAssignments = assignments.filter(a => !a.is_completed && a.due_date);
    if (pendingAssignments.length === 0) {
        const emptyPlan = [];
        for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
            const currentDate = new Date(baseDate);
            currentDate.setDate(baseDate.getDate() + dayOffset);
            const dateStr = getLocalDateKey(currentDate);
            const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
            const isRestDay = restDays.includes(dayOfWeek) || restDays.includes(currentDate.getDay());
            emptyPlan.push({
                date: dateStr,
                currentDate,
                dayOffset,
                dayOfWeek,
                displayDate: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                fullDate: currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
                isToday: dayOffset === 0,
                isRestDay,
                totalMinutes: 0,
                blocks: [],
                allBlocks: []
            });
        }
        cachedStudyPlan = emptyPlan;
        return emptyPlan;
    }

    // Initialize day buckets
    const days = [];
    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(baseDate.getDate() + dayOffset);
        const dateStr = getLocalDateKey(currentDate);
        const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
        const isRestDay = restDays.includes(dayOfWeek) || restDays.includes(currentDate.getDay());
        days.push({
            date: dateStr,
            currentDate,
            dayOffset,
            dayOfWeek,
            displayDate: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            fullDate: currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
            isToday: dayOffset === 0,
            isRestDay,
            totalMinutes: 0,
            assignedTasks: []
        });
    }

    // Helper to generate rich block
    function createStudyBlock(task, course, currentDate, customTitle = null, customMinutes = null, customRec = null) {
        let localTypes = {};
        let localPrios = {};
        try {
            if (typeof localStorage !== 'undefined') {
                localTypes = JSON.parse(localStorage.getItem('duevinci_assignment_types') || '{}');
                localPrios = JSON.parse(localStorage.getItem('duevinci_assignment_priorities') || '{}');
            }
        } catch (e) {}

        let taskType = localTypes[task.id] || task.task_type || task.type;
        if (!taskType) {
            if (/exam|final|midterm|test/i.test(task.title)) taskType = 'exam';
            else if (/review|recap|summary|synthesis/i.test(task.title)) taskType = 'review';
            else if (/lab|project|code/i.test(task.title)) taskType = 'lab';
            else if (/reading|chapter|book/i.test(task.title)) taskType = 'reading';
            else taskType = 'lesson';
        }

        const isExam = taskType === 'exam';
        const isReview = taskType === 'review';
        const durationMin = customMinutes !== null ? customMinutes : (isExam ? 50 : 25);
        const daysLeft = calculateDaysRemaining(task.due_date, currentDate);

        let priority = localPrios[task.id] || task.priority || 'medium';
        if (priority === 'urgent') priority = 'high';
        if (priority === 'normal') priority = 'medium';

        let priorityBadgeText = '⚡ Normal';
        if (priority === 'high') priorityBadgeText = '🔥 Urgent';
        else if (priority === 'low') priorityBadgeText = '🌱 Low';

        let typeBadgeText = '📖 Lesson';
        if (taskType === 'exam') typeBadgeText = '🎯 Exam';
        else if (taskType === 'review') typeBadgeText = '📝 Review';
        else if (taskType === 'lab') typeBadgeText = '🔬 Lab';
        else if (taskType === 'reading') typeBadgeText = '📚 Reading';
        else if (taskType === 'assignment') typeBadgeText = '💻 Assign';

        const unitNum = getUnitNumber(task);
        const lessonNum = getLessonNumber(task);
        const hasExplicitLesson = lessonNum !== 999;
        const isSub = (task.title || '').startsWith('↳');

        let unitBadgeText = unitNum > 0 ? `Unit ${unitNum}` : '';
        let lessonBadgeText = hasExplicitLesson ? `Lesson ${lessonNum}` : '';

        let dueText = 'Due today';
        if (daysLeft < 0) dueText = `Overdue (${Math.abs(daysLeft)}d ago)`;
        else if (daysLeft === 1) dueText = 'Due tomorrow';
        else if (daysLeft > 1) dueText = `Due in ${daysLeft} days`;

        let recommendation = customRec;
        if (!recommendation) {
            if (isExam) {
                recommendation = 'Active recall with flashcards, practice exam problems, and formula review.';
            } else if (isReview) {
                recommendation = 'Unit synthesis & review: connect core concepts across lessons, complete active problem sets, and review study deck.';
            } else if (hasExplicitLesson && lessonNum === 1) {
                recommendation = `Foundational concepts for Unit ${unitNum || 1} • Lesson 1: Master core definitions, review syllabus objectives, and build foundational notes.`;
            } else if (hasExplicitLesson && lessonNum > 1 && lessonNum < 4) {
                recommendation = `Sequential mastery for Lesson ${lessonNum}: Connect to prior lesson topics, complete active practice problems, and reinforce core mechanisms.`;
            } else if (hasExplicitLesson && lessonNum >= 4) {
                recommendation = `Advanced unit synthesis for Lesson ${lessonNum}: Consolidate earlier lessons, complete problem sets, and review cumulative unit flashcards.`;
            } else if (/reading|chapter|read|textbook/i.test(task.title) || taskType === 'reading') {
                recommendation = 'Synthesize key definitions, generate summary bullet points, and review diagrams.';
            } else if (/lab|project|code|program/i.test(task.title) || taskType === 'lab') {
                recommendation = 'Work on core logic implementation, execute test cases, and document edge conditions.';
            } else {
                recommendation = 'Break task into active work sprints. Review core assignment rubrics.';
            }
        }

        const blockTitle = customTitle || task.title.replace('↳', '').trim();

        return {
            taskId: task.id,
            title: blockTitle,
            rawTitle: task.title,
            courseId: task.course_id,
            courseCode: course ? course.code : 'Course',
            courseName: course ? (course.name || course.code) : 'Course',
            courseEmoji: course ? (course.emoji || '📚') : '📚',
            courseColor: course ? course.color : '#4f46e5',
            unitNumber: unitNum,
            lessonNumber: hasExplicitLesson ? lessonNum : null,
            unitBadgeText,
            lessonBadgeText,
            isSubLesson: isSub,
            taskType,
            typeBadgeText,
            priority,
            priorityBadgeText,
            durationMinutes: durationMin,
            isExam,
            isReview,
            dueDate: task.due_date,
            daysUntilDue: daysLeft,
            dueText,
            recommendation,
            isCompleted: !!task.is_completed
        };
    }

    // Helper to sort tasks in strict pedagogical curriculum order
    function sortTasks(taskList, refDate, isDailyHeaderFirst = false) {
        return [...taskList].sort((a, b) => {
            const daysLeftA = calculateDaysRemaining(a.due_date, refDate);
            const daysLeftB = calculateDaysRemaining(b.due_date, refDate);

            // 1. Overdue tasks first
            const isOverdueA = daysLeftA < 0;
            const isOverdueB = daysLeftB < 0;
            if (isOverdueA && !isOverdueB) return -1;
            if (!isOverdueA && isOverdueB) return 1;

            // 2. Due date order
            const dateDiff = new Date(a.due_date) - new Date(b.due_date);
            if (dateDiff !== 0) return dateDiff;

            // 3. Unit number organization (Unit 1 before Unit 2)
            const unitA = getUnitNumber(a);
            const unitB = getUnitNumber(b);
            if (unitA !== unitB) return unitA - unitB;

            // 4. If same unit: Parent unit header first when displaying daily list,
            // but sub-lessons first when progressing through curriculum queue
            const isSubA = (a.title || '').startsWith('↳');
            const isSubB = (b.title || '').startsWith('↳');
            if (isDailyHeaderFirst) {
                if (!isSubA && isSubB) return -1;
                if (isSubA && !isSubB) return 1;
            } else {
                if (isSubA && !isSubB) return -1;
                if (!isSubA && isSubB) return 1;
            }

            // 5. Strict Lesson sequential order (Lesson 1 -> 2 -> 3 -> 4)
            const lessonA = getLessonNumber(a);
            const lessonB = getLessonNumber(b);
            if (lessonA !== lessonB) return lessonA - lessonB;

            return (a.title || '').localeCompare(b.title || '');
        });
    }

    // Group pending assignments by Course
    const courseMap = new Map();
    courses.forEach(c => courseMap.set(c.id, []));
    courseMap.set('orphaned', []);

    pendingAssignments.forEach(task => {
        const cId = courses.some(c => c.id === task.course_id) ? task.course_id : 'orphaned';
        courseMap.get(cId).push(task);
    });

    // Allocate lessons unit-by-unit and lesson-by-lesson, spaced across available study days leading to due dates
    courseMap.forEach((cTasks, courseId) => {
        if (cTasks.length === 0) return;

        // Group tasks by unit number
        const unitGroups = new Map();
        cTasks.forEach(t => {
            const uNum = getUnitNumber(t);
            if (!unitGroups.has(uNum)) unitGroups.set(uNum, []);
            unitGroups.get(uNum).push(t);
        });

        // Sort unit keys sequentially: 0 (General/Intro), 1 (Unit 1), 2 (Unit 2), 3 (Unit 3)...
        // A hard deadline takes precedence over curriculum order. Units with the
        // same deadline retain their normal numerical sequence.
        const sortedUnitKeys = Array.from(unitGroups.keys()).sort((a, b) => {
            const deadlineA = Math.min(...unitGroups.get(a).map(t => calculateDaysRemaining(t.due_date, baseDate)));
            const deadlineB = Math.min(...unitGroups.get(b).map(t => calculateDaysRemaining(t.due_date, baseDate)));
            return deadlineA - deadlineB || a - b;
        });

        let currentDayPointer = 0;

        sortedUnitKeys.forEach(uKey => {
            const unitTaskList = sortTasks(unitGroups.get(uKey), baseDate, false);
            if (unitTaskList.length === 0) return;

            // Find unit deadline (in days from baseDate)
            const deadlines = unitTaskList.map(t => calculateDaysRemaining(t.due_date, baseDate));
            const minDeadline = Math.min(...deadlines);

            // If unit is overdue (minDeadline < 0) or due today (minDeadline === 0)
            if (minDeadline <= 0) {
                unitTaskList.forEach(task => {
                    days[0].assignedTasks.push({ task });
                });
                currentDayPointer = Math.max(currentDayPointer, 1);
                return;
            }

            // Find target end day for this unit (capped at daysAhead - 1)
            const targetEndDay = Math.min(daysAhead - 1, Math.max(currentDayPointer, minDeadline));

            // Collect active (non-rest) study days available for this unit
            let activeDayIndices = [];
            for (let d = currentDayPointer; d <= targetEndDay; d++) {
                if (!days[d].isRestDay) {
                    activeDayIndices.push(d);
                }
            }

            // If every available day is a rest day, the deadline remains a hard
            // constraint: schedule on its date rather than silently moving work late.
            if (activeDayIndices.length === 0) {
                activeDayIndices = [targetEndDay];
            }

            // Distribute unit tasks evenly across active days available
            const tasksPerActiveDay = Math.max(1, Math.ceil(unitTaskList.length / activeDayIndices.length));
            let activeIdx = 0;
            let countOnCurrentDay = 0;
            let lastDayAssigned = activeDayIndices[0];

            unitTaskList.forEach(task => {
                const daySlot = activeDayIndices[activeIdx];
                days[daySlot].assignedTasks.push({ task });
                lastDayAssigned = daySlot;
                countOnCurrentDay++;

                if (countOnCurrentDay >= tasksPerActiveDay && activeIdx < activeDayIndices.length - 1) {
                    activeIdx++;
                    countOnCurrentDay = 0;
                }
            });

            // Advance pointer to the day after this unit completes
            currentDayPointer = Math.min(daysAhead - 1, lastDayAssigned + 1);
        });
    });

    // A course-by-course allocation can otherwise stack every course's first
    // lesson on day zero. Rebalance only when there is later, non-rest time
    // before the item's own deadline.
    rebalanceStudyPlanAssignments(days);
    applyManualStudyMoves(days);

    // Build rich daily blocks from assigned tasks
    days.forEach(day => {
        // Collect assigned tasks for this day (and ensure overdue tasks are surfaced on Day 0)
        const combinedTasks = [...day.assignedTasks];
        if (day.isToday) {
            pendingAssignments.forEach(task => {
                const daysLeft = calculateDaysRemaining(task.due_date, day.currentDate);
                if (daysLeft < 0) {
                    if (!combinedTasks.some(ct => ct.task.id === task.id)) {
                        combinedTasks.push({ task });
                    }
                }
            });
        }

        // Deduplicate assigned tasks by task id + custom title
        const seen = new Set();
        const uniqueTaskData = [];
        combinedTasks.forEach(td => {
            const key = `${td.task.id}_${td.customTitle || td.task.title}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueTaskData.push(td);
            }
        });

        // Sort unique tasks for this day strictly by curriculum order (Parent header first for day display)
        const sortedDayTasks = sortTasks(uniqueTaskData.map(td => td.task), day.currentDate, true);

        let totalMins = 0;
        const blocks = [];

        sortedDayTasks.forEach(task => {
            const td = uniqueTaskData.find(u => u.task.id === task.id) || { task };
            const course = courses.find(c => c.id === task.course_id);
            const block = createStudyBlock(task, course, day.currentDate, td.customTitle, td.customMinutes, td.customRec);
            blocks.push(block);
            totalMins += block.durationMinutes;
        });

        day.allBlocks = blocks;
        day.blocks = blocks.slice(0, 3);
        day.totalMinutes = totalMins;
    });

    cachedStudyPlan = days;
    return days;
}

/**
 * Ensures the modal container DOM element exists.
 */
export function ensureStudyPlanDayModalExists() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('studyPlanDayModal')) return;

    const modal = document.createElement('div');
    modal.id = 'studyPlanDayModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/75 backdrop-blur-sm hidden p-4 overflow-y-auto';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.onclick = (e) => {
        if (e.target === modal) closeStudyPlanDayModal();
    };
    document.body.appendChild(modal);

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeStudyPlanDayModal();
        }
    });
}

/**
 * Opens the full-day study plan popup modal.
 * @param {string} dateStr YYYY-MM-DD date string
 */
export async function openStudyPlanDayModal(dateStr) {
    if (typeof document === 'undefined') return;
    ensureStudyPlanDayModalExists();

    const modal = document.getElementById('studyPlanDayModal');
    if (!modal) return;

    let day = cachedStudyPlan.find(d => d.date === dateStr);

    if (!day) {
        // Recalculate if not found in cache
        let courses = [];
        let assignments = [];
        try {
            if (supabaseClient) {
                const { data: c } = await supabaseClient.from('courses').select('*');
                const { data: a } = await supabaseClient.from('assignments').select('*');
                if (c && c.length > 0) courses = c;
                if (a && a.length > 0) assignments = a;
            }
        } catch (e) {}

        if (courses.length === 0 && typeof window !== 'undefined' && Array.isArray(window.localCourses)) {
            courses = window.localCourses;
        }
        if (assignments.length === 0 && courses.length > 0) {
            courses.forEach(c => {
                if (Array.isArray(c.assignments)) {
                    c.assignments.forEach(a => assignments.push({ ...a, course_id: a.course_id || c.id }));
                }
            });
        }

        if (courses.length > 0) {
            const plan = generateBalancedStudyPlan(courses, assignments, new Date(), 7);
            day = plan.find(d => d.date === dateStr) || plan[0];
        }
    }

    if (!day) return;

    // Intensity calculation
    let intensityLabel = 'Rest & Light Review';
    let intensityBg = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    let intensityIcon = '🌴';

    if (day.totalMinutes > 90) {
        intensityLabel = 'Heavy Study Load';
        intensityBg = 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30';
        intensityIcon = '🚨';
    } else if (day.totalMinutes > 45) {
        intensityLabel = 'Moderate Focus Day';
        intensityBg = 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
        intensityIcon = '🔥';
    } else if (day.totalMinutes > 0) {
        intensityLabel = 'Light Study Session';
        intensityBg = 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30';
        intensityIcon = '⚡';
    }

    const uniqueCourses = new Set(day.allBlocks.map(b => b.courseCode)).size;
    const examCount = day.allBlocks.filter(b => b.isExam).length;

    let tasksHtml = '';
    if (day.allBlocks.length === 0) {
        if (day.isRestDay) {
            tasksHtml = `
                <div class="py-10 px-6 text-center space-y-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-dashed border-emerald-300 dark:border-emerald-800/40">
                    <span class="text-4xl inline-block">🌴</span>
                    <h4 class="text-base font-black text-emerald-800 dark:text-emerald-300">Scheduled Rest & Recovery Day</h4>
                    <p class="text-xs text-zinc-600 dark:text-zinc-300 max-w-md mx-auto leading-relaxed">
                        No coursework is scheduled for today. Enjoy your break to recharge, or jump into light flashcard review when ready!
                    </p>
                </div>
            `;
        } else {
            tasksHtml = `
                <div class="py-10 px-6 text-center space-y-3 bg-zinc-50 dark:bg-brand-900 rounded-2xl border border-dashed border-zinc-300 dark:border-brand-700">
                    <span class="text-4xl inline-block">🎉</span>
                    <h4 class="text-base font-black text-zinc-900 dark:text-white">No Urgent Deadlines Scheduled</h4>
                    <p class="text-xs text-zinc-600 dark:text-zinc-300 max-w-md mx-auto leading-relaxed">
                        You have no pressing assignments due within this window. Enjoy some well-deserved rest, or use this time for self-paced reading and light flashcard review!
                    </p>
                </div>
            `;
        }
    } else {
        tasksHtml = day.allBlocks.map((block, idx) => `
            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-2xl border border-zinc-200 dark:border-brand-700 space-y-3 transition hover:border-indigo-400 dark:hover:border-indigo-500">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-2xl shrink-0 p-2 bg-white dark:bg-brand-800 rounded-xl shadow-xs border border-zinc-200 dark:border-brand-700">${block.courseEmoji}</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-brand-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-brand-700">${block.courseCode}</span>
                                ${block.unitBadgeText ? `<span class="font-bold text-[11px] px-2 py-0.5 rounded-md bg-zinc-200/70 dark:bg-brand-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-brand-600">${block.unitBadgeText}</span>` : ''}
                                <span class="font-bold text-[11px] px-2 py-0.5 rounded-md ${block.isExam ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30' : (block.isReview ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30')}">${block.typeBadgeText || '📖 Lesson'}</span>
                                ${block.priority === 'high' ? '<span class="font-bold text-[11px] px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">🔥 Urgent</span>' : (block.priority === 'low' ? '<span class="font-bold text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">🌱 Low</span>' : '<span class="font-bold text-[11px] px-2 py-0.5 rounded-md bg-zinc-200/60 dark:bg-brand-700 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-brand-600">⚡ Normal</span>')}
                                <span class="text-[11px] font-bold ${block.daysUntilDue <= 1 ? 'text-rose-500 font-extrabold' : 'text-zinc-500 dark:text-zinc-400'}">• ${block.dueText}</span>
                            </div>
                            <h4 class="font-black text-sm text-zinc-900 dark:text-white truncate mt-1">${escapeHtml(block.title)}</h4>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 ${block.isExam ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30' : (block.isReview ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30')}">
                            ${block.isExam ? '🎯 50m Exam Prep' : (block.isReview ? '📝 25m Review Block' : '⏱️ 25m Focus Block')}
                        </span>
                    </div>
                </div>

                <!-- AI Study Strategy Tip -->
                <div class="p-3 bg-white dark:bg-brand-800 rounded-xl border border-zinc-200/80 dark:border-brand-700 flex items-start gap-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                    <span class="text-sm shrink-0">💡</span>
                    <div class="leading-relaxed">
                        <strong class="font-extrabold text-zinc-900 dark:text-white">Recommended Strategy:</strong> ${block.recommendation}
                    </div>
                </div>

                <!-- Interactive Actions -->
                <div class="flex items-center justify-between pt-1 text-xs">
                    <button type="button" onclick="startStudyPlanTimer(${block.durationMinutes}, '${escapeInlineJs(block.title)}')" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-xs">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        Start ${block.durationMinutes}m Timer
                    </button>
                    <button type="button" onclick="toggleStudyPlanAssignment('${escapeInlineJs(block.taskId)}', ${block.isCompleted}, '${escapeInlineJs(block.courseId)}', '${dateStr}')" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-800 dark:text-zinc-200 font-bold rounded-xl transition">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                        Mark Done
                    </button>
                </div>
            </div>
        `).join('');
    }

    modal.innerHTML = `
        <div class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-700 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 text-zinc-800 dark:text-zinc-200">
            <!-- Modal Header -->
            <div class="p-6 pb-4 border-b border-zinc-200 dark:border-brand-700 bg-zinc-50/80 dark:bg-brand-900 flex items-start justify-between gap-4">
                <div class="space-y-1.5">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xl">🗓️</span>
                        <h3 class="font-black text-xl text-zinc-900 dark:text-white">${day.fullDate || `${day.dayOfWeek}, ${day.displayDate}`}</h3>
                        ${day.isToday ? '<span class="text-[10px] bg-indigo-600 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">Today</span>' : ''}
                        ${day.isRestDay ? '<span class="text-[10px] bg-emerald-500 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">🌴 Rest Day</span>' : ''}
                    </div>
                    <div class="flex items-center gap-2 flex-wrap text-xs">
                        <span class="px-2.5 py-0.5 rounded-full border font-bold ${intensityBg}">
                            ${intensityIcon} ${intensityLabel}
                        </span>
                        <span class="text-zinc-600 dark:text-zinc-400 font-medium">
                            • ${day.totalMinutes} minutes total projected study time
                        </span>
                    </div>
                </div>
                <button type="button" onclick="closeStudyPlanDayModal()" class="w-9 h-9 rounded-xl bg-zinc-200/80 hover:bg-zinc-300 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-700 dark:text-zinc-200 flex items-center justify-center font-bold text-sm transition">✕</button>
            </div>

            <!-- Rest Day Toggle Bar -->
            <div class="px-6 py-2.5 bg-zinc-100/70 dark:bg-brand-900/80 border-b border-zinc-200 dark:border-brand-700 flex items-center justify-between text-xs">
                <span class="text-zinc-600 dark:text-zinc-400 font-medium">
                    ${day.isRestDay ? '🌴 This day is marked as a <strong>Rest Day</strong> (no study blocks assigned).' : '📚 This day is an active <strong>Study Day</strong>.'}
                </span>
                <button type="button" onclick="toggleRestDay('${day.dayOfWeek}'); openStudyPlanDayModal('${day.date}')" class="px-3 py-1 bg-white dark:bg-brand-800 hover:bg-zinc-200 dark:hover:bg-brand-700 font-bold rounded-lg border border-zinc-300 dark:border-brand-600 text-zinc-700 dark:text-zinc-300 transition text-[11px]">
                    ${day.isRestDay ? '✏️ Make Study Day' : '🌴 Set as Rest Day'}
                </button>
            </div>

            <!-- Summary Stats Bar -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-zinc-100/60 dark:bg-brand-900 border-b border-zinc-200 dark:border-brand-700 text-xs">
                <div class="p-3 bg-white dark:bg-brand-800 rounded-xl border border-zinc-200/80 dark:border-brand-700 shadow-xs">
                    <div class="text-zinc-500 dark:text-zinc-400 font-bold text-[10px] uppercase tracking-wider">Planned Time</div>
                    <div class="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">${day.totalMinutes} mins</div>
                </div>
                <div class="p-3 bg-white dark:bg-brand-800 rounded-xl border border-zinc-200/80 dark:border-brand-700 shadow-xs">
                    <div class="text-zinc-500 dark:text-zinc-400 font-bold text-[10px] uppercase tracking-wider">Subjects</div>
                    <div class="text-base font-black text-zinc-900 dark:text-white mt-0.5">${uniqueCourses} Courses</div>
                </div>
                <div class="p-3 bg-white dark:bg-brand-800 rounded-xl border border-zinc-200/80 dark:border-brand-700 shadow-xs">
                    <div class="text-zinc-500 dark:text-zinc-400 font-bold text-[10px] uppercase tracking-wider">Study Blocks</div>
                    <div class="text-base font-black text-zinc-900 dark:text-white mt-0.5">${day.allBlocks.length} Tasks</div>
                </div>
                <div class="p-3 bg-white dark:bg-brand-800 rounded-xl border border-zinc-200/80 dark:border-brand-700 shadow-xs">
                    <div class="text-zinc-500 dark:text-zinc-400 font-bold text-[10px] uppercase tracking-wider">Exams Pending</div>
                    <div class="text-base font-black ${examCount > 0 ? 'text-rose-500' : 'text-zinc-900 dark:text-white'} mt-0.5">${examCount} Tests</div>
                </div>
            </div>

            <!-- Modal Body (Scrollable Task List) -->
            <div class="p-6 space-y-4 overflow-y-auto max-h-[55vh] bg-white dark:bg-brand-800">
                <div class="flex justify-between items-center pb-1">
                    <h4 class="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">All Scheduled Blocks (${day.allBlocks.length})</h4>
                    <span class="text-[11px] text-zinc-400 font-medium">Sequential Unit & Lesson Order</span>
                </div>
                <div class="space-y-3">
                    ${tasksHtml}
                </div>

                <!-- AI Workload Balancer Advice Callout -->
                <div class="p-4 bg-indigo-50/80 dark:bg-brand-900 rounded-2xl border border-indigo-200/80 dark:border-brand-700 flex items-start gap-3 text-xs text-zinc-800 dark:text-zinc-200 mt-4">
                    <span class="text-lg shrink-0">🧠</span>
                    <div class="leading-relaxed">
                        <strong class="font-extrabold text-indigo-700 dark:text-indigo-400">Workload Balancer Pro-Tip:</strong> Distributing assignments across active study days while preserving scheduled rest days helps prevent cognitive fatigue and boosts retention.
                    </div>
                </div>
            </div>

            <!-- Modal Footer -->
            <div class="p-4 px-6 bg-zinc-50 dark:bg-brand-900 border-t border-zinc-200 dark:border-brand-700 flex items-center justify-between gap-3">
                <span class="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Click any timer to jump straight into deep work.</span>
                <button type="button" onclick="closeStudyPlanDayModal()" class="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-brand-700 dark:hover:bg-brand-600 text-white font-bold rounded-xl text-xs transition shadow-sm">
                    Close Plan
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

/**
 * Closes the study plan day modal popup.
 */
export function closeStudyPlanDayModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('studyPlanDayModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Starts a timer session directly from a study block.
 * @param {number} durationMinutes Duration in minutes
 * @param {string} taskTitle Title of task being studied
 */
export function startStudyPlanTimer(durationMinutes = 25, taskTitle = '') {
    if (typeof window !== 'undefined') {
        if (typeof window.setTimerDuration === 'function') {
            window.setTimerDuration(durationMinutes, true);
        } else {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('focusMinutes', durationMinutes);
                localStorage.setItem('timeLeft', durationMinutes * 60);
                localStorage.setItem('timerIsWorking', 'true');
            }
            if (typeof window.resetTimer === 'function') window.resetTimer();
        }
        if (!window.timerRunning && typeof window.toggleTimer === 'function') {
            window.toggleTimer();
        }
    }
    closeStudyPlanDayModal();
}

/**
 * Helper to mark an assignment completed from within the study plan popup.
 */
export async function toggleStudyPlanAssignment(assignId, currentState, courseId, dateStr) {
    if (!supabaseClient) return;
    const newState = !currentState;
    await supabaseClient.from('assignments').update({ is_completed: newState }).eq('id', assignId);
    if (newState) fireConfetti();

    // Refresh dashboard widget and re-open modal with refreshed data
    if (typeof window !== 'undefined' && typeof window.renderStudyPlanDashboardWidget === 'function') {
        await window.renderStudyPlanDashboardWidget('studyPlanWidgetContainer');
    }
    if (dateStr) {
        await openStudyPlanDayModal(dateStr);
    }
}

/**
 * Renders the Smart Study Plan widget into a dashboard container.
 */
export async function renderStudyPlanDashboardWidget(containerId = 'studyPlanWidgetContainer') {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

    ensureStudyPlanDayModalExists();

    let courses = [];
    let assignments = [];

    try {
        if (supabaseClient) {
            const coursesRes = await supabaseClient.from('courses').select('*');
            if (coursesRes.data && coursesRes.data.length > 0) courses = coursesRes.data;

            const assignRes = await supabaseClient.from('assignments').select('*');
            if (assignRes.data && assignRes.data.length > 0) assignments = assignRes.data;
        }
    } catch (e) {
        console.warn('Supabase fetch failed in study plan:', e);
    }

    // Fallback to localCourses or cached memory
    if (courses.length === 0 && typeof window !== 'undefined' && Array.isArray(window.localCourses) && window.localCourses.length > 0) {
        courses = window.localCourses;
    }

    if (assignments.length === 0 && courses.length > 0) {
        courses.forEach(c => {
            if (Array.isArray(c.assignments)) {
                c.assignments.forEach(a => assignments.push({ ...a, course_id: a.course_id || c.id }));
            }
        });
    }

    const restDays = getRestDays();

    if (courses.length === 0) {
        container.innerHTML = `
            <div class="bg-white dark:bg-brand-800 p-6 rounded-2xl border border-zinc-200 dark:border-brand-700 shadow-sm space-y-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3 border-b border-zinc-200 dark:border-brand-700">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">🗓️</div>
                        <div>
                            <h3 class="text-sm font-extrabold text-zinc-900 dark:text-white">Smart Study Plan & Workload Balancer</h3>
                            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Optimized daily study blocks distributed evenly leading up to deadlines.</p>
                        </div>
                    </div>
                </div>
                <div class="py-8 px-4 text-center space-y-3 bg-zinc-50 dark:bg-brand-900/50 rounded-xl border border-dashed border-zinc-300 dark:border-brand-700">
                    <span class="text-3xl">📚</span>
                    <h4 class="font-bold text-sm text-zinc-800 dark:text-zinc-200">No Enrolled Courses Yet</h4>
                    <p class="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">Add your classes and parse your syllabus to automatically balance your weekly study schedule.</p>
                    <a href="courses/index.html" class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm">
                        + Add Courses
                    </a>
                </div>
            </div>
        `;
        return;
    }

    const plan = generateBalancedStudyPlan(courses, assignments, new Date(), 5);

    let daysHtml = '';
    plan.forEach(day => {
        let blocksHtml = '';
        if (day.blocks.length === 0) {
            if (day.isRestDay) {
                blocksHtml = `<p class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold py-1">🌴 Rest & Recovery Day</p>`;
            } else {
                blocksHtml = `<p class="text-[11px] text-zinc-400 italic py-1">No urgent study blocks. Light review day! 🎉</p>`;
            }
        } else {
            day.blocks.forEach(b => {
                blocksHtml += `
                    <div draggable="true" ondragstart="startStudyPlanDrag(event, '${escapeInlineJs(b.taskId)}')" onclick="event.stopPropagation()" class="flex items-center justify-between p-2 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs cursor-grab active:cursor-grabbing" title="Drag to another eligible study day">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-sm shrink-0">${escapeHtml(b.courseEmoji)}</span>
                            <div class="truncate flex items-center gap-1">
                                <span class="font-bold text-zinc-800 dark:text-zinc-200 shrink-0">${escapeHtml(b.courseCode)}</span>
                                ${b.unitBadgeText ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-brand-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-brand-700 shrink-0">${b.unitBadgeText}</span>` : ''}
                                ${b.lessonBadgeText ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 shrink-0">${b.lessonBadgeText}</span>` : ''}
                                <span class="text-zinc-500 dark:text-zinc-400 font-medium truncate ml-0.5">${escapeHtml(b.title)}</span>
                            </div>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${b.isExam ? 'bg-rose-500/10 text-rose-500 font-extrabold animate-pulse' : 'bg-indigo-500/10 text-indigo-500'}">
                            ${b.durationMinutes}m ${b.isExam ? '🔥' : '⏱️'}
                        </span>
                    </div>
                `;
            });
            if (day.allBlocks.length > day.blocks.length) {
                blocksHtml += `
                    <div class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 text-center pt-0.5">
                        +${day.allBlocks.length - day.blocks.length} more study session${day.allBlocks.length - day.blocks.length > 1 ? 's' : ''}
                    </div>
                `;
            }
        }

        daysHtml += `
            <div onclick="openStudyPlanDayModal('${day.date}')" ondragover="allowStudyPlanDrop(event)" ondrop="dropStudyPlanBlock(event, '${day.date}')" class="group cursor-pointer p-3.5 rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${day.isRestDay ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300/70 dark:border-emerald-800/40' : (day.isToday ? 'bg-indigo-50/50 dark:bg-brand-800 border-indigo-500/80 shadow-xs ring-1 ring-indigo-500/20' : 'bg-zinc-50/80 dark:bg-brand-800 border-zinc-200 dark:border-brand-700 hover:border-indigo-400 dark:hover:border-indigo-500')} space-y-2.5">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-extrabold flex items-center gap-1.5 ${day.isRestDay ? 'text-emerald-700 dark:text-emerald-300' : (day.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300')}">
                        ${day.dayOfWeek}, ${day.displayDate}
                        ${day.isToday ? '<span class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black tracking-wider uppercase">TODAY</span>' : ''}
                        ${day.isRestDay ? '<span class="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold tracking-wider">REST</span>' : ''}
                    </span>
                    <span class="text-[11px] text-zinc-400 font-mono font-medium">${day.totalMinutes}m planned</span>
                </div>
                <div class="space-y-1.5">${blocksHtml}</div>
                <div class="pt-1 border-t border-zinc-200/50 dark:border-brand-700/50 flex items-center justify-between text-[11px]">
                    <span class="text-zinc-400 font-medium">${day.allBlocks.length} session${day.allBlocks.length === 1 ? '' : 's'}</span>
                    <span class="text-indigo-600 dark:text-indigo-400 font-bold group-hover:underline flex items-center gap-1">
                        View Plan <span class="group-hover:translate-x-0.5 transition-transform">&rarr;</span>
                    </span>
                </div>
            </div>
        `;
    });

    const dayPillsHtml = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => {
        const isRest = restDays.includes(d);
        return `<button type="button" onclick="toggleRestDay('${d}')" class="px-2 py-0.5 rounded-lg text-[11px] font-bold transition ${isRest ? 'bg-emerald-500 text-white shadow-xs' : 'bg-zinc-100 dark:bg-brand-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-600'}" title="Toggle ${d} as Rest Day">${d}${isRest ? ' 🌴' : ''}</button>`;
    }).join('');

    container.innerHTML = `
        <div class="bg-white dark:bg-brand-800 p-6 rounded-2xl border border-zinc-200 dark:border-brand-700 shadow-sm space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-brand-700">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">🗓️</div>
                    <div>
                        <h3 class="text-sm font-extrabold text-zinc-900 dark:text-white">Smart Study Plan & Workload Balancer</h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Optimized daily study blocks distributed evenly leading up to deadlines.</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <div class="flex items-center gap-1 bg-zinc-50 dark:bg-brand-900 p-1 rounded-xl border border-zinc-200 dark:border-brand-700">
                        <span class="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 px-1.5">Rest:</span>
                        ${dayPillsHtml}
                    </div>
                    <button type="button" onclick="resetManualStudyPlanMoves()" class="text-xs text-zinc-500 dark:text-zinc-400 font-bold hover:underline px-2 py-1">Reset moves</button>
                    <button type="button" onclick="renderStudyPlanDashboardWidget('studyPlanWidgetContainer')" class="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline px-2 py-1">↺ Refresh</button>
                </div>
            </div>
            <p aria-live="polite" class="text-[11px] ${studyPlanMoveNotice ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400'}">${studyPlanMoveNotice || 'Drag a study block to an active day before its due date. Lesson order stays protected.'}</p>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                ${daysHtml}
            </div>
        </div>
    `;
}

// Bind to window / global
const _studyScope = typeof window !== 'undefined' ? window : globalThis;
_studyScope.getUnitNumber = getUnitNumber;
_studyScope.getLessonNumber = getLessonNumber;
_studyScope.getRestDays = getRestDays;
_studyScope.setRestDays = setRestDays;
_studyScope.toggleRestDay = toggleRestDay;
_studyScope.generateBalancedStudyPlan = generateBalancedStudyPlan;
_studyScope.renderStudyPlanDashboardWidget = renderStudyPlanDashboardWidget;
_studyScope.ensureStudyPlanDayModalExists = ensureStudyPlanDayModalExists;
_studyScope.openStudyPlanDayModal = openStudyPlanDayModal;
_studyScope.closeStudyPlanDayModal = closeStudyPlanDayModal;
_studyScope.startStudyPlanTimer = startStudyPlanTimer;
_studyScope.toggleStudyPlanAssignment = toggleStudyPlanAssignment;
_studyScope.startStudyPlanDrag = startStudyPlanDrag;
_studyScope.allowStudyPlanDrop = allowStudyPlanDrop;
_studyScope.dropStudyPlanBlock = dropStudyPlanBlock;
_studyScope.moveStudyPlanBlock = moveStudyPlanBlock;
_studyScope.resetManualStudyPlanMoves = resetManualStudyPlanMoves;
