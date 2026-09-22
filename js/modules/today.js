import { supabaseClient } from './config.js';
import { escapeHtml, escapeInlineJs, fireConfetti, getLocalDateKey } from './utils.js';
import { generateBalancedStudyPlan } from './studyPlan.js';
import { applyDashboardWidgetLayout, isWorkspaceFeatureVisible } from './ui.js';
import { getSubscriptionSnapshot, hasSubscriptionFeature } from './subscription.js';

function todayKey(date = new Date()) { return getLocalDateKey(date); }
function inlineArg(value) { return escapeHtml(escapeInlineJs(value)); }

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
    const showTodayFocus = isWorkspaceFeatureVisible('today_focus');
    const [{ data: courses }, { data: assignments }, { data: events }] = await Promise.all([supabaseClient.from('courses').select('*'), supabaseClient.from('assignments').select('*'), supabaseClient.from('custom_events').select('*')]);
    const courseList = courses || [], assignmentList = assignments || [], day = todayKey();
    const blocks = generateBalancedStudyPlan(courseList, assignmentList, new Date(), 1)[0]?.blocks || [];
    let showProBrief = false;
    if (showTodayFocus && isWorkspaceFeatureVisible('daily_brief')) {
        try { showProBrief = hasSubscriptionFeature(await getSubscriptionSnapshot(), 'daily_brief'); } catch { /* Keep the free focus card available if billing status is offline. */ }
    }
    const task = blocks[0] || prioritizeTodayTasks(assignmentList, day)[0];
    const eventCount = (events || []).filter((event) => String(event.event_date).slice(0, 10) === day).length;
    const completed = assignmentList.filter((assignment) => assignment.is_completed).length;
    const weekEnd = todayKey(new Date(Date.now() + 6 * 86400000));
    const openDatedAssignments = assignmentList.filter((assignment) => !assignment.is_completed && assignment.due_date);
    const overdueCount = openDatedAssignments.filter((assignment) => String(assignment.due_date).slice(0, 10) < day).length;
    const dueTodayCount = openDatedAssignments.filter((assignment) => String(assignment.due_date).slice(0, 10) === day).length;
    const dueThisWeek = assignmentList.filter((assignment) => !assignment.is_completed && assignment.due_date && String(assignment.due_date).slice(0, 10) >= day && String(assignment.due_date).slice(0, 10) <= weekEnd).length;
    if (!showTodayFocus) {
        document.getElementById('todayWorkspace')?.remove();
        await renderAdaptiveDailyBrief(courseList, assignmentList, events || [], blocks);
        return;
    }
    let card = document.getElementById('todayWorkspace');
    const widgetHost = document.getElementById('dashboardWidgets') || dashboard;
    if (!card) { card = document.createElement('section'); card.id = 'todayWorkspace'; card.dataset.dashboardWidget = 'today_focus'; widgetHost.insertBefore(card, widgetHost.firstElementChild); }
    const taskId = task?.taskId || task?.id, title = task?.title || 'Nothing urgent right now', detail = task ? (task.courseName || courseList.find((course) => course.id === task.course_id)?.name || 'Coursework') : 'Use this time to review notes or plan your week.', minutes = Math.max(1, Math.min(180, Number(task?.durationMinutes) || 25));
    card.className = 'lg:col-span-2 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 dark:border-indigo-500/20 dark:from-brand-800 dark:via-brand-800 dark:to-indigo-950/30';
    const focusLabel = showProBrief ? 'DueVinci Pro · Daily Brief' : 'Today’s focus';
    const summaryStats = showProBrief
        ? `<div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${overdueCount}</span><span class="text-xs text-zinc-500">overdue</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${dueTodayCount}</span><span class="text-xs text-zinc-500">due today</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${dueThisWeek}</span><span class="text-xs text-zinc-500">due this week</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${eventCount}</span><span class="text-xs text-zinc-500">calendar events today</span></div>`
        : `<div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${blocks.length}</span><span class="text-xs text-zinc-500">study blocks planned</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${eventCount}</span><span class="text-xs text-zinc-500">calendar events today</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${completed} / ${assignmentList.length}</span><span class="text-xs text-zinc-500">completed · ${dueThisWeek} due this week</span></div>`;
    card.innerHTML = `<div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div class="min-w-0"><p class="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">${focusLabel}</p><h3 class="mt-1 truncate text-xl font-black text-zinc-900 dark:text-white">${escapeHtml(title)}</h3><p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">${escapeHtml(detail)}${task?.dueText ? ` · ${escapeHtml(task.dueText)}` : ''}</p></div><div class="flex flex-wrap gap-2">${taskId ? `<button type="button" onclick="completeTodayTask('${inlineArg(taskId)}')" class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-brand-700 dark:text-white">Complete</button><button type="button" onclick="startTodayFocus(${minutes})" class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Start ${minutes}m focus</button>` : `<button type="button" onclick="openQuickAddModal()" class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Add a task</button>`}</div></div><div class="mt-5 grid gap-3 ${showProBrief ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}">${summaryStats}</div>`;
    await renderAdaptiveDailyBrief(courseList, assignmentList, events || [], blocks);
    applyDashboardWidgetLayout();
}

export async function renderAdaptiveDailyBrief(courses = null, assignments = null, events = null, blocks = null) {
    const cardId = 'adaptiveDailyBrief';
    const removeCard = () => document.getElementById(cardId)?.remove();
    // When Today's Focus is visible, its Pro variant contains the brief stats
    // already; keep one actionable dashboard card instead of repeating it.
    if (isWorkspaceFeatureVisible('today_focus')) { removeCard(); return; }
    if (!isWorkspaceFeatureVisible('daily_brief')) { removeCard(); return; }

    let snapshot;
    try { snapshot = await getSubscriptionSnapshot(); } catch { removeCard(); return; }
    if (!hasSubscriptionFeature(snapshot, 'daily_brief')) { removeCard(); return; }

    if (!Array.isArray(courses) || !Array.isArray(assignments) || !Array.isArray(events)) {
        const [{ data: courseRows }, { data: assignmentRows }, { data: eventRows }] = await Promise.all([
            supabaseClient.from('courses').select('*'),
            supabaseClient.from('assignments').select('*'),
            supabaseClient.from('custom_events').select('*'),
        ]);
        courses = courseRows || [];
        assignments = assignmentRows || [];
        events = eventRows || [];
    }

    const today = todayKey();
    const weekEnd = todayKey(new Date(Date.now() + 6 * 86400000));
    const openTasks = assignments.filter((task) => !task.is_completed && task.due_date);
    const overdueTasks = openTasks.filter((task) => String(task.due_date).slice(0, 10) < today);
    const dueTodayTasks = openTasks.filter((task) => String(task.due_date).slice(0, 10) === today);
    const dueThisWeek = openTasks.filter((task) => String(task.due_date).slice(0, 10) >= today && String(task.due_date).slice(0, 10) <= weekEnd);
    const nextTask = [...overdueTasks, ...dueTodayTasks, ...dueThisWeek]
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
    const nextTitle = nextTask?.title || (blocks?.[0]?.title) || 'Take a short review break';
    const courseName = courses.find((course) => course.id === nextTask?.course_id)?.name;
    const focusLine = overdueTasks.length
        ? `Start with ${overdueTasks.length} overdue item${overdueTasks.length === 1 ? '' : 's'}; the next one is ${nextTitle}${courseName ? ` for ${courseName}` : ''}.`
        : dueTodayTasks.length
            ? `${dueTodayTasks.length} item${dueTodayTasks.length === 1 ? '' : 's'} due today. Begin with ${nextTitle}${courseName ? ` for ${courseName}` : ''}.`
            : dueThisWeek.length
                ? `Nothing is due today. You have ${dueThisWeek.length} item${dueThisWeek.length === 1 ? '' : 's'} due this week; start early on ${nextTitle}.`
        : 'No dated work is due this week. Use a focus block to review notes or plan ahead.';
    const eventCount = events.filter((event) => String(event.event_date).slice(0, 10) === today).length;
    const widgetHost = document.getElementById('dashboardWidgets') || document.getElementById('dashboardGrid');
    if (!widgetHost) return;
    let card = document.getElementById(cardId);
    if (!card) {
        card = document.createElement('section');
        card.id = cardId;
        card.dataset.dashboardWidget = 'daily_brief';
        widgetHost.appendChild(card);
    }
    card.className = 'lg:col-span-2 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 dark:border-violet-500/30 dark:from-brand-800 dark:via-brand-800 dark:to-indigo-950/30';
    card.innerHTML = `<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0"><p class="text-xs font-black uppercase tracking-widest text-violet-700 dark:text-violet-300">DueVinci Pro · Daily Brief</p><h3 class="mt-1 text-lg font-black text-zinc-900 dark:text-white">A clear next step for today</h3><p class="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">${escapeHtml(focusLine)}</p></div><button type="button" onclick="openWeeklyPlan()" class="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700">Adjust my plan</button></div><div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${overdueTasks.length}</b><span class="text-xs text-zinc-500">overdue</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${dueTodayTasks.length}</b><span class="text-xs text-zinc-500">due today</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${dueThisWeek.length}</b><span class="text-xs text-zinc-500">due this week</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${eventCount}</b><span class="text-xs text-zinc-500">calendar events today</span></div></div>`;
    applyDashboardWidgetLayout();
}

export async function completeTodayTask(taskId) { const { error } = await supabaseClient.from('assignments').update({ is_completed: true }).eq('id', taskId); if (!error) { fireConfetti(); await renderTodayWorkspace(); window.loadDashboardStats?.(); } }
export function startTodayFocus(minutes = 25) { window.startStudyPlanTimer?.(minutes); }
if (typeof window !== 'undefined') Object.assign(window, { renderTodayWorkspace, renderAdaptiveDailyBrief, completeTodayTask, startTodayFocus });
