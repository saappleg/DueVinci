// --- AI STUDY SCHEDULE & WORKLOAD BALANCER MODULE ---
import { calculateDaysRemaining } from './academics.js';
import { supabaseClient } from './config.js';
import { fireConfetti } from './utils.js';

let cachedStudyPlan = [];

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
 * Calculates a balanced daily study schedule across multiple enrolled courses.
 * Enforces proper unit-lesson organization and strict sequential order (Lesson 1 -> Lesson 2 -> Lesson 3 -> Lesson 4).
 * @param {Array} courses List of course objects
 * @param {Array} assignments List of assignment objects
 * @param {Date} startDate Starting calculation date
 * @param {number} daysAhead Number of days to project forward (default 7)
 * @returns {Array} List of daily study plan objects
 */
export function generateBalancedStudyPlan(courses = [], assignments = [], startDate = new Date(), daysAhead = 7) {
    if (!courses || !assignments) return [];

    const plan = [];
    const baseDate = new Date(startDate);
    baseDate.setHours(0, 0, 0, 0);

    const pendingAssignments = assignments.filter(a => !a.is_completed && a.due_date);

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(baseDate.getDate() + dayOffset);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
        const displayDate = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const fullDate = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        // Find assignments due on or shortly after this date
        const relevantTasks = pendingAssignments.filter(a => {
            const daysLeft = calculateDaysRemaining(a.due_date, currentDate);
            return daysLeft >= 0 && daysLeft <= 4;
        });

        // Enforce proper Unit & Lesson organization and strict sequential order (Lesson 1 -> 2 -> 3 -> 4)
        relevantTasks.sort((a, b) => {
            // 1. Urgency / Due date order
            const dateDiff = new Date(a.due_date) - new Date(b.due_date);
            if (dateDiff !== 0) return dateDiff;

            // 2. Unit number organization (e.g. Unit 1 before Unit 2)
            const unitA = getUnitNumber(a);
            const unitB = getUnitNumber(b);
            if (unitA !== unitB) return unitA - unitB;

            // 3. Parent Unit overview before sub-lessons
            const isSubA = (a.title || '').startsWith('↳');
            const isSubB = (b.title || '').startsWith('↳');
            if (!isSubA && isSubB) return -1;
            if (isSubA && !isSubB) return 1;

            // 4. Strict Lesson sequential order (Lesson 1, 2, 3, 4...)
            const lessonA = getLessonNumber(a);
            const lessonB = getLessonNumber(b);
            if (lessonA !== lessonB) return lessonA - lessonB;

            // 5. Deterministic fallback sort by title
            return (a.title || '').localeCompare(b.title || '');
        });

        const allDailyBlocks = [];
        let totalEstimatedMinutes = 0;

        relevantTasks.forEach(task => {
            const course = courses.find(c => c.id === task.course_id);
            const isExam = /exam|final|midterm|test/i.test(task.title);
            const durationMin = isExam ? 50 : 25; // 50m block for exams, 25m for regular lessons
            const daysLeft = calculateDaysRemaining(task.due_date, currentDate);

            const unitNum = getUnitNumber(task);
            const lessonNum = getLessonNumber(task);
            const hasExplicitLesson = lessonNum !== 999;
            const isSub = (task.title || '').startsWith('↳');

            let unitBadgeText = unitNum > 0 ? `Unit ${unitNum}` : '';
            let lessonBadgeText = hasExplicitLesson ? `Lesson ${lessonNum}` : '';

            let dueText = 'Due today';
            if (daysLeft === 1) dueText = 'Due tomorrow';
            else if (daysLeft > 1) dueText = `Due in ${daysLeft} days`;

            let recommendation = 'Break task into active work sprints. Review core assignment rubrics.';
            if (isExam) {
                recommendation = 'Active recall with flashcards, practice exam problems, and formula review.';
            } else if (hasExplicitLesson && lessonNum === 1) {
                recommendation = `Foundational concepts for Unit ${unitNum || 1} • Lesson 1: Master core definitions, review syllabus objectives, and build foundational notes.`;
            } else if (hasExplicitLesson && lessonNum > 1 && lessonNum < 4) {
                recommendation = `Sequential mastery for Lesson ${lessonNum}: Connect to prior lesson topics, complete active practice problems, and reinforce core mechanisms.`;
            } else if (hasExplicitLesson && lessonNum >= 4) {
                recommendation = `Advanced unit synthesis for Lesson ${lessonNum}: Consolidate earlier lessons, complete problem sets, and review cumulative unit flashcards.`;
            } else if (/reading|chapter|read|textbook/i.test(task.title)) {
                recommendation = 'Synthesize key definitions, generate summary bullet points, and review diagrams.';
            } else if (/lab|project|code|program/i.test(task.title)) {
                recommendation = 'Work on core logic implementation, execute test cases, and document edge conditions.';
            }

            const block = {
                taskId: task.id,
                title: task.title.replace('↳', '').trim(),
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
                durationMinutes: durationMin,
                isExam,
                dueDate: task.due_date,
                daysUntilDue: daysLeft,
                dueText,
                recommendation,
                isCompleted: !!task.is_completed
            };

            allDailyBlocks.push(block);
            totalEstimatedMinutes += durationMin;
        });

        plan.push({
            date: dateStr,
            dayOfWeek,
            displayDate,
            fullDate,
            isToday: dayOffset === 0,
            totalMinutes: totalEstimatedMinutes,
            blocks: allDailyBlocks.slice(0, 3), // Preview blocks for dashboard card
            allBlocks: allDailyBlocks // Complete list for full day popup modal
        });
    }

    cachedStudyPlan = plan;
    return plan;
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
        const { data: courses } = await supabaseClient.from('courses').select('*');
        const { data: assignments } = await supabaseClient.from('assignments').select('*');
        if (courses && assignments) {
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
        tasksHtml = `
            <div class="py-10 px-6 text-center space-y-3 bg-zinc-50 dark:bg-brand-900 rounded-2xl border border-dashed border-zinc-300 dark:border-brand-700">
                <span class="text-4xl inline-block">🎉</span>
                <h4 class="text-base font-black text-zinc-900 dark:text-white">No Urgent Deadlines Scheduled</h4>
                <p class="text-xs text-zinc-600 dark:text-zinc-300 max-w-md mx-auto leading-relaxed">
                    You have no pressing assignments due within this window. Enjoy some well-deserved rest, or use this time for self-paced reading and light flashcard review!
                </p>
            </div>
        `;
    } else {
        tasksHtml = day.allBlocks.map((block, idx) => `
            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-2xl border border-zinc-200 dark:border-brand-700 space-y-3 transition hover:border-indigo-400 dark:hover:border-indigo-500">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-2xl shrink-0 p-2 bg-white dark:bg-brand-800 rounded-xl shadow-xs border border-zinc-200 dark:border-brand-700">${block.courseEmoji}</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-brand-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-brand-700">${block.courseCode}</span>
                                ${block.unitBadgeText ? `<span class="font-bold text-[11px] px-2 py-0.5 rounded-md bg-zinc-200/70 dark:bg-brand-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-brand-600">${block.unitBadgeText}</span>` : ''}
                                ${block.lessonBadgeText ? `<span class="font-bold text-[11px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30">📖 ${block.lessonBadgeText}</span>` : ''}
                                <span class="text-[11px] font-bold ${block.daysUntilDue <= 1 ? 'text-rose-500 font-extrabold' : 'text-zinc-500 dark:text-zinc-400'}">${block.dueText}</span>
                            </div>
                            <h4 class="font-black text-sm text-zinc-900 dark:text-white truncate mt-1">${block.title}</h4>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 ${block.isExam ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30' : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'}">
                            ${block.isExam ? '🔥 50m Exam Prep' : '⏱️ 25m Focus Block'}
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
                    <button type="button" onclick="startStudyPlanTimer(${block.durationMinutes}, '${block.title.replace(/'/g, "\\'")}')" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-xs">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        Start ${block.durationMinutes}m Timer
                    </button>
                    <button type="button" onclick="toggleStudyPlanAssignment('${block.taskId}', ${block.isCompleted}, '${block.courseId}', '${dateStr}')" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-800 dark:text-zinc-200 font-bold rounded-xl transition">
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
                        <strong class="font-extrabold text-indigo-700 dark:text-indigo-400">Workload Balancer Pro-Tip:</strong> Distributing assignments across 3–4 days prior to deadlines prevents cognitive overload and improves exam performance by up to 35% compared to single-session cramming.
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
    if (typeof window !== 'undefined' && typeof window.toggleTimer === 'function') {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('focusMinutes', durationMinutes);
            localStorage.setItem('timeLeft', durationMinutes * 60);
            localStorage.setItem('timerIsWorking', 'true');
        }
        if (window.resetTimer) window.resetTimer();
        if (!window.timerRunning && window.toggleTimer) window.toggleTimer();
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

    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (!courses || !assignments) return;

    const plan = generateBalancedStudyPlan(courses, assignments, new Date(), 5);

    let daysHtml = '';
    plan.forEach(day => {
        let blocksHtml = '';
        if (day.blocks.length === 0) {
            blocksHtml = `<p class="text-[11px] text-zinc-400 italic py-1">No urgent study blocks. Light review day! 🎉</p>`;
        } else {
            day.blocks.forEach(b => {
                blocksHtml += `
                    <div class="flex items-center justify-between p-2 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-sm shrink-0">${b.courseEmoji}</span>
                            <div class="truncate flex items-center gap-1">
                                <span class="font-bold text-zinc-800 dark:text-zinc-200 shrink-0">${b.courseCode}</span>
                                ${b.unitBadgeText ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-brand-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-brand-700 shrink-0">${b.unitBadgeText}</span>` : ''}
                                ${b.lessonBadgeText ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 shrink-0">${b.lessonBadgeText}</span>` : ''}
                                <span class="text-zinc-500 dark:text-zinc-400 font-medium truncate ml-0.5">${b.title}</span>
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
            <div onclick="openStudyPlanDayModal('${day.date}')" class="group cursor-pointer p-3.5 rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${day.isToday ? 'bg-indigo-50/50 dark:bg-brand-800 border-indigo-500/80 shadow-xs ring-1 ring-indigo-500/20' : 'bg-zinc-50/80 dark:bg-brand-800 border-zinc-200 dark:border-brand-700 hover:border-indigo-400 dark:hover:border-indigo-500'} space-y-2.5">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-extrabold flex items-center gap-1.5 ${day.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300'}">
                        ${day.dayOfWeek}, ${day.displayDate} ${day.isToday ? '<span class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black tracking-wider uppercase">TODAY</span>' : ''}
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

    container.innerHTML = `
        <div class="bg-white dark:bg-brand-800 p-6 rounded-2xl border border-zinc-200 dark:border-brand-700 shadow-sm space-y-4">
            <div class="flex justify-between items-center pb-3 border-b border-zinc-200 dark:border-brand-700">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">🗓️</div>
                    <div>
                        <h3 class="text-sm font-extrabold text-zinc-900 dark:text-white">Smart Study Plan & Workload Balancer</h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Optimized daily study blocks distributed evenly leading up to deadlines. Click any day to open the full plan popup.</p>
                    </div>
                </div>
                <button type="button" onclick="renderStudyPlanDashboardWidget('studyPlanWidgetContainer')" class="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline">↺ Refresh Plan</button>
            </div>
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
_studyScope.generateBalancedStudyPlan = generateBalancedStudyPlan;
_studyScope.renderStudyPlanDashboardWidget = renderStudyPlanDashboardWidget;
_studyScope.ensureStudyPlanDayModalExists = ensureStudyPlanDayModalExists;
_studyScope.openStudyPlanDayModal = openStudyPlanDayModal;
_studyScope.closeStudyPlanDayModal = closeStudyPlanDayModal;
_studyScope.startStudyPlanTimer = startStudyPlanTimer;
_studyScope.toggleStudyPlanAssignment = toggleStudyPlanAssignment;


