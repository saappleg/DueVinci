// --- AI STUDY SCHEDULE & WORKLOAD BALANCER MODULE ---
import { calculateDaysRemaining } from './academics.js';
import { supabaseClient } from './config.js';

/**
 * Calculates a balanced daily study schedule across multiple enrolled courses.
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

        // Find assignments due on or shortly after this date
        const relevantTasks = pendingAssignments.filter(a => {
            const daysLeft = calculateDaysRemaining(a.due_date, currentDate);
            return daysLeft >= 0 && daysLeft <= 4;
        });

        // Sort by urgency (earliest due first)
        relevantTasks.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

        const dailyBlocks = [];
        let totalEstimatedMinutes = 0;

        relevantTasks.slice(0, 3).forEach(task => {
            const course = courses.find(c => c.id === task.course_id);
            const isExam = /exam|final|midterm|test/i.test(task.title);
            const durationMin = isExam ? 50 : 25; // 50m block for exams, 25m for regular lessons

            dailyBlocks.push({
                taskId: task.id,
                title: task.title.replace('↳', '').trim(),
                courseCode: course ? course.code : 'Course',
                courseEmoji: course ? (course.emoji || '📚') : '📚',
                courseColor: course ? course.color : '#4f46e5',
                durationMinutes: durationMin,
                isExam
            });
            totalEstimatedMinutes += durationMin;
        });

        plan.push({
            date: dateStr,
            dayOfWeek,
            displayDate,
            isToday: dayOffset === 0,
            totalMinutes: totalEstimatedMinutes,
            blocks: dailyBlocks
        });
    }

    return plan;
}

/**
 * Renders the Smart Study Plan widget into a dashboard container.
 */
export async function renderStudyPlanDashboardWidget(containerId = 'studyPlanWidgetContainer') {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

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
                            <div class="truncate">
                                <span class="font-bold text-zinc-800 dark:text-zinc-200">${b.courseCode}</span>
                                <span class="text-zinc-500 dark:text-zinc-400 font-medium ml-1">${b.title}</span>
                            </div>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${b.isExam ? 'bg-rose-500/10 text-rose-500 font-extrabold animate-pulse' : 'bg-indigo-500/10 text-indigo-500'}">
                            ${b.durationMinutes}m ${b.isExam ? '🔥' : '⏱️'}
                        </span>
                    </div>
                `;
            });
        }

        daysHtml += `
            <div class="p-3 rounded-xl border ${day.isToday ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-500 shadow-sm' : 'bg-zinc-50/70 dark:bg-brand-850 border-zinc-200 dark:border-brand-700'} space-y-2">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-extrabold ${day.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300'}">
                        ${day.dayOfWeek}, ${day.displayDate} ${day.isToday ? '<span class="ml-1 text-[10px] bg-indigo-500 text-white px-1.5 py-0.2 rounded font-bold">TODAY</span>' : ''}
                    </span>
                    <span class="text-[11px] text-zinc-400 font-mono font-medium">${day.totalMinutes}m planned</span>
                </div>
                <div class="space-y-1.5">${blocksHtml}</div>
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
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Optimized daily study blocks distributed evenly leading up to deadlines.</p>
                    </div>
                </div>
                <button type="button" onclick="renderStudyPlanDashboardWidget('studyPlanWidgetContainer')" class="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline">↺ Refresh Plan</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${daysHtml}
            </div>
        </div>
    `;
}

// Bind to window / global
const _studyScope = typeof window !== 'undefined' ? window : globalThis;
_studyScope.generateBalancedStudyPlan = generateBalancedStudyPlan;
_studyScope.renderStudyPlanDashboardWidget = renderStudyPlanDashboardWidget;
