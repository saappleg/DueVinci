import { supabaseClient } from './config.js';
import { escapeHtml, fireConfetti } from './utils.js';
import { generateBalancedStudyPlan } from './studyPlan.js';
import { applyDashboardWidgetLayout, isWorkspaceFeatureVisible } from './ui.js';

function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }

export function prioritizeTodayTasks(assignments = [], today = todayKey()) {
    return assignments.filter((task) => !task.is_completed && task.due_date).sort((a, b) => {
        const overdueA = String(a.due_date).slice(0, 10) < today ? 0 : 1;
        const overdueB = String(b.due_date).slice(0, 10) < today ? 0 : 1;
        if (overdueA !== overdueB) return overdueA - overdueB;
        const priority = { high: 0, urgent: 0, medium: 1, normal: 1, low: 2 };
        if ((priority[a.priority] ?? 1) !== (priority[b.priority] ?? 1)) return (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1);
        return String(a.due_date).localeCompare(String(b.due_date));
    });
}

export async function renderTodayWorkspace() {
    if (typeof document === 'undefined') return;
    const dashboard = document.getElementById('dashboardGrid');
    if (!dashboard) return;
    if (!isWorkspaceFeatureVisible('today_focus')) {
        document.getElementById('todayWorkspace')?.remove();
        return;
    }
    const [{ data: courses }, { data: assignments }, { data: events }] = await Promise.all([supabaseClient.from('courses').select('*'), supabaseClient.from('assignments').select('*'), supabaseClient.from('custom_events').select('*')]);
    const courseList = courses || [], assignmentList = assignments || [], day = todayKey();
    const blocks = generateBalancedStudyPlan(courseList, assignmentList, new Date(), 1)[0]?.blocks || [];
    const task = blocks[0] || prioritizeTodayTasks(assignmentList, day)[0];
    const eventCount = (events || []).filter((event) => String(event.event_date).slice(0, 10) === day).length;
    const completed = assignmentList.filter((assignment) => assignment.is_completed).length;
    const weekEnd = todayKey(new Date(Date.now() + 6 * 86400000));
    const dueThisWeek = assignmentList.filter((assignment) => !assignment.is_completed && assignment.due_date && String(assignment.due_date).slice(0, 10) >= day && String(assignment.due_date).slice(0, 10) <= weekEnd).length;
    let card = document.getElementById('todayWorkspace');
    const widgetHost = document.getElementById('dashboardWidgets') || dashboard;
    if (!card) { card = document.createElement('section'); card.id = 'todayWorkspace'; card.dataset.dashboardWidget = 'today_focus'; widgetHost.insertBefore(card, widgetHost.firstElementChild); }
    const taskId = task?.taskId || task?.id, title = task?.title || 'Nothing urgent right now', detail = task ? (task.courseName || courseList.find((course) => course.id === task.course_id)?.name || 'Coursework') : 'Use this time to review notes or plan your week.', minutes = task?.durationMinutes || 25;
    card.className = 'lg:col-span-2 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 dark:border-indigo-500/20 dark:from-brand-800 dark:via-brand-800 dark:to-indigo-950/30';
    card.innerHTML = `<div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div class="min-w-0"><p class="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Today’s focus</p><h3 class="mt-1 truncate text-xl font-black text-zinc-900 dark:text-white">${escapeHtml(title)}</h3><p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">${escapeHtml(detail)}${task?.dueText ? ` · ${escapeHtml(task.dueText)}` : ''}</p></div><div class="flex flex-wrap gap-2">${taskId ? `<button type="button" onclick="completeTodayTask('${taskId}')" class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-brand-700 dark:text-white">Complete</button><button type="button" onclick="startTodayFocus(${Number(minutes) || 25})" class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Start ${minutes}m focus</button>` : `<button type="button" onclick="openQuickAddModal()" class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Add a task</button>`}</div></div><div class="mt-5 grid gap-3 sm:grid-cols-3"><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${blocks.length}</span><span class="text-xs text-zinc-500">study blocks planned</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${eventCount}</span><span class="text-xs text-zinc-500">calendar events today</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${completed} / ${assignmentList.length}</span><span class="text-xs text-zinc-500">completed · ${dueThisWeek} due this week</span></div></div>`;
    applyDashboardWidgetLayout();
}

export async function completeTodayTask(taskId) { const { error } = await supabaseClient.from('assignments').update({ is_completed: true }).eq('id', taskId); if (!error) { fireConfetti(); await renderTodayWorkspace(); window.loadDashboardStats?.(); } }
export function startTodayFocus(minutes = 25) { window.startStudyPlanTimer?.(minutes); }
if (typeof window !== 'undefined') Object.assign(window, { renderTodayWorkspace, completeTodayTask, startTodayFocus });
