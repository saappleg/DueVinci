import { supabaseClient } from './config.js';
import { escapeHtml, escapeInlineJs, fireConfetti, getLocalDateKey, recordStudyActivity } from './utils.js';
import { generateBalancedStudyPlan, getCurrentStudyWeekAssignments, startStudyPlanTimer } from './studyPlan.js';
import { applyDashboardWidgetLayout, isWorkspaceFeatureVisible } from './ui.js';
import { getSubscriptionSnapshot, hasSubscriptionFeature } from './subscription.js';
import { getWeekStartDayIndex } from './weekPreferences.js';
import { recordSelfReportedStudyMinutesIfEntitled, recordStudyPlanCompletionIfEntitled } from './studyCalibration.js';
import { consumeCompletedTaskTimerMarker, hasCompletedTaskTimerSession } from './timers.js';

let completionDialogResolve = null;
let completionDialogPromise = null;

function ensureCompletionDialog() {
    if (typeof document === 'undefined') return null;
    let dialog = document.getElementById('todayCompletionDialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'todayCompletionDialog';
    dialog.setAttribute('aria-labelledby', 'todayCompletionDialogTitle');
    dialog.setAttribute('aria-describedby', 'todayCompletionDialogDescription');
    dialog.className = 'w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl dark:border-brand-600 dark:bg-brand-800 dark:text-white';
    dialog.innerHTML = `
        <div class="space-y-2">
            <h2 id="todayCompletionDialogTitle" class="text-base font-extrabold">Complete this task</h2>
            <p id="todayCompletionDialogDescription" class="text-sm text-zinc-600 dark:text-zinc-300">Add an approximate amount of study time if you want. You can skip it and still complete the task.</p>
        </div>
        <form id="todayCompletionDialogForm" class="mt-4 space-y-4">
            <div>
                <label for="todayCompletionMinutes" class="mb-1.5 block text-sm font-semibold">Approximate minutes spent <span class="font-normal text-zinc-500">(optional)</span></label>
                <input id="todayCompletionMinutes" type="number" inputmode="numeric" min="1" max="480" step="1" aria-describedby="todayCompletionMinutesHelp" class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-brand-600 dark:bg-brand-900 dark:text-white">
                <p id="todayCompletionMinutesHelp" class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">Study time is saved only when Personalized study estimates are enabled with an active Pro plan.</p>
            </div>
            <p id="todayCompletionDialogStatus" class="text-xs text-red-600 dark:text-red-400" role="status" aria-live="polite"></p>
            <div class="flex flex-wrap justify-end gap-2">
                <button id="todayCompletionCancel" type="button" class="min-h-[44px] rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-brand-600 dark:text-zinc-200 dark:hover:bg-brand-700">Cancel</button>
                <button id="todayCompletionSkip" type="button" class="min-h-[44px] rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-brand-600 dark:text-zinc-200 dark:hover:bg-brand-700">Skip time and complete</button>
                <button type="submit" class="min-h-[44px] rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700">Save time and complete</button>
            </div>
        </form>`;
    document.body.appendChild(dialog);

    const form = dialog.querySelector('#todayCompletionDialogForm');
    const input = dialog.querySelector('#todayCompletionMinutes');
    const status = dialog.querySelector('#todayCompletionDialogStatus');
    const settle = (result) => {
        const resolve = completionDialogResolve;
        completionDialogResolve = null;
        completionDialogPromise = null;
        if (dialog.open) dialog.close();
        resolve?.(result);
    };
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        settle({ confirmed: false, minutes: null });
    });
    dialog.querySelector('#todayCompletionCancel').addEventListener('click', () => settle({ confirmed: false, minutes: null }));
    dialog.querySelector('#todayCompletionSkip').addEventListener('click', () => settle({ confirmed: true, minutes: null }));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        input.setCustomValidity('');
        const value = input.value.trim();
        if (!value) {
            settle({ confirmed: true, minutes: null });
            return;
        }
        const minutes = Number(value);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
            input.setCustomValidity('Enter a whole number from 1 to 480 minutes, or skip time.');
            input.reportValidity();
            status.textContent = 'Enter a whole number from 1 to 480 minutes, or skip time.';
            input.focus();
            return;
        }
        settle({ confirmed: true, minutes });
    });
    return dialog;
}

function requestApproximateStudyMinutes(taskTitle = '') {
    if (completionDialogPromise) return completionDialogPromise;
    const dialog = ensureCompletionDialog();
    if (!dialog || typeof dialog.showModal !== 'function') {
        if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
            return Promise.resolve({ confirmed: true, minutes: null });
        }
        const value = window.prompt(`Approximate minutes spent on ${taskTitle || 'this task'}? Leave blank to skip; Cancel stops completion.`);
        if (value === null) return Promise.resolve({ confirmed: false, minutes: null });
        if (!value.trim()) return Promise.resolve({ confirmed: true, minutes: null });
        const minutes = Number(value);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
            window.alert?.('Enter a whole number from 1 to 480 minutes, or leave it blank to skip.');
            return Promise.resolve({ confirmed: false, minutes: null });
        }
        return Promise.resolve({ confirmed: true, minutes });
    }

    const title = dialog.querySelector('#todayCompletionDialogTitle');
    const input = dialog.querySelector('#todayCompletionMinutes');
    const status = dialog.querySelector('#todayCompletionDialogStatus');
    title.textContent = taskTitle ? `Complete “${taskTitle}”` : 'Complete this task';
    input.value = '';
    input.setCustomValidity('');
    status.textContent = '';
    completionDialogPromise = new Promise((resolve) => {
        completionDialogResolve = resolve;
        dialog.showModal();
        input.focus();
    });
    return completionDialogPromise;
}

function todayKey(date = new Date()) { return getLocalDateKey(date); }
function inlineArg(value) { return escapeHtml(escapeInlineJs(value)); }

function calendarWeekEnd(date = new Date()) {
    const end = new Date(date);
    end.setHours(12, 0, 0, 0);
    const lastWeekday = (getWeekStartDayIndex() + 6) % 7;
    end.setDate(end.getDate() + ((lastWeekday - end.getDay() + 7) % 7));
    return todayKey(end);
}

function isActionableAssignment(task) {
    const title = String(task?.title || '').trim();
    const isUnitHeading = /^(?:unit|week|wk|module|mod|chapter)\s*#?\d+\b/i.test(title) ||
        /^(?:unit|week|wk|module|mod|chapter)\s*[:—–-]?\s*$/i.test(title);
    return !isUnitHeading || /lesson|exam|final|midterm|test|review|assignment|lab|project|reading|quiz|essay|check[\s-]?in/i.test(title);
}

export function summarizeDailyBrief(courses = [], assignments = [], referenceDate = new Date()) {
    const today = todayKey(referenceDate);
    const weekEnd = calendarWeekEnd(referenceDate);
    // Match the planner's course-window and current-week rules so completed
    // courses and later units do not leak into the Daily Brief.
    const openTasks = getCurrentStudyWeekAssignments(courses, assignments, referenceDate)
        .filter((task) => !task.is_completed && task.due_date && isActionableAssignment(task));
    const overdueTasks = openTasks.filter((task) => String(task.due_date).slice(0, 10) < today);
    const dueTodayTasks = openTasks.filter((task) => String(task.due_date).slice(0, 10) === today);
    const dueThisWeekTasks = openTasks.filter((task) => {
        const dueDate = String(task.due_date).slice(0, 10);
        // The card already reports today's items separately. Keep these
        // counts mutually exclusive and stop at the selected week's end.
        return dueDate > today && dueDate <= weekEnd;
    });
    return { today, weekEnd, openTasks, overdueTasks, dueTodayTasks, dueThisWeekTasks };
}

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
    const brief = summarizeDailyBrief(courseList, assignmentList, new Date());
    const blocks = generateBalancedStudyPlan(courseList, assignmentList, new Date(), 1)[0]?.blocks || [];
    const focusTasks = [...brief.overdueTasks, ...brief.dueTodayTasks, ...brief.dueThisWeekTasks];
    const actionableBlocks = blocks.filter((block) => focusTasks.some((assignment) => assignment.id === (block.taskId || block.id)));
    let showProBrief = false;
    if (showTodayFocus && isWorkspaceFeatureVisible('daily_brief')) {
        try { showProBrief = hasSubscriptionFeature(await getSubscriptionSnapshot(), 'daily_brief'); } catch { /* Keep the free focus card available if billing status is offline. */ }
    }
    const task = actionableBlocks[0] || prioritizeTodayTasks(focusTasks, day)[0];
    const activeEvents = (events || []).filter((event) => event.is_active !== false);
    const eventCount = activeEvents.filter((event) => String(event.event_date).slice(0, 10) === day).length;
    const completed = assignmentList.filter((assignment) => assignment.is_completed).length;
    const overdueCount = brief.overdueTasks.length;
    const dueTodayCount = brief.dueTodayTasks.length;
    const dueThisWeek = brief.dueThisWeekTasks.length;
    if (!showTodayFocus) {
        document.getElementById('todayWorkspace')?.remove();
        await renderAdaptiveDailyBrief(courseList, assignmentList, events || [], blocks);
        return;
    }
    let card = document.getElementById('todayWorkspace');
    const widgetHost = document.getElementById('dashboardWidgets') || dashboard;
    if (!card) { card = document.createElement('section'); card.id = 'todayWorkspace'; card.dataset.dashboardWidget = 'today_focus'; widgetHost.insertBefore(card, widgetHost.firstElementChild); }
    const taskId = task?.taskId || task?.id;
    const title = task?.rawTitle || task?.title || 'Nothing urgent right now';
    const detail = task ? (task.courseName || courseList.find((course) => course.id === (task.courseId || task.course_id))?.name || 'Coursework') : 'Use this time to review notes or plan your week.';
    const minutes = Math.max(1, Math.min(180, Number(task?.durationMinutes) || 25));
    const taskCourseId = task?.courseId || task?.course_id || '';
    const taskType = task?.taskType || task?.task_type || task?.type || '';
    const taskEstimatedMinutes = Math.max(1, Math.min(480, Number(task?.baselineDurationMinutes || task?.estimated_minutes) || minutes));
    const taskIdArg = inlineArg(taskId || ''), courseIdArg = inlineArg(taskCourseId), taskTypeArg = inlineArg(taskType), titleArg = inlineArg(title);
    card.className = 'lg:col-span-2 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 dark:border-indigo-500/20 dark:from-brand-800 dark:via-brand-800 dark:to-indigo-950/30';
    const focusLabel = showProBrief ? 'DueVinci Pro · Daily Brief' : 'Today’s focus';
    const summaryStats = showProBrief
        ? `<div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${overdueCount}</span><span class="text-xs text-zinc-500">overdue</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${dueTodayCount}</span><span class="text-xs text-zinc-500">due today</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${dueThisWeek}</span><span class="text-xs text-zinc-500">due later this week</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${eventCount}</span><span class="text-xs text-zinc-500">calendar events today</span></div>`
        : `<div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${actionableBlocks.length}</span><span class="text-xs text-zinc-500">study blocks planned</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${eventCount}</span><span class="text-xs text-zinc-500">calendar events today</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><span class="block text-lg font-black">${completed} / ${assignmentList.length}</span><span class="text-xs text-zinc-500">completed · ${dueThisWeek} due later this week</span></div>`;
    card.innerHTML = `<div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div class="min-w-0"><p class="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">${focusLabel}</p><h3 class="mt-1 truncate text-xl font-black text-zinc-900 dark:text-white">${escapeHtml(title)}</h3><p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">${escapeHtml(detail)}${task?.dueText ? ` · ${escapeHtml(task.dueText)}` : ''}</p></div><div class="flex flex-wrap gap-2">${taskId ? `<button type="button" onclick="completeTodayTask('${taskIdArg}', '${courseIdArg}', '${taskTypeArg}', '${titleArg}', ${taskEstimatedMinutes})" class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-brand-700 dark:text-white">Complete</button><button type="button" onclick="startTodayFocus(${minutes}, '${taskIdArg}', '${courseIdArg}', '${taskTypeArg}', '${titleArg}', ${taskEstimatedMinutes})" class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Start ${minutes}m focus</button>` : `<button type="button" onclick="openQuickAddModal()" class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Add a task</button>`}</div></div><p id="todayCompletionStatus" class="mt-2 text-xs text-rose-700 dark:text-rose-300" role="status" aria-live="polite"></p><div class="mt-5 grid gap-3 ${showProBrief ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}">${summaryStats}</div>`;
    await renderAdaptiveDailyBrief(courseList, assignmentList, activeEvents, blocks);
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
        events = (eventRows || []).filter((event) => event.is_active !== false);
    }

    const { today, overdueTasks, dueTodayTasks, dueThisWeekTasks } = summarizeDailyBrief(courses, assignments, new Date());
    const nextTask = [...overdueTasks, ...dueTodayTasks, ...dueThisWeekTasks]
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
    const nextTitle = nextTask?.title || (blocks?.[0]?.title) || 'Take a short review break';
    const courseName = courses.find((course) => course.id === nextTask?.course_id)?.name;
    const focusLine = overdueTasks.length
        ? `Start with ${overdueTasks.length} overdue item${overdueTasks.length === 1 ? '' : 's'}; the next one is ${nextTitle}${courseName ? ` for ${courseName}` : ''}.`
        : dueTodayTasks.length
            ? `${dueTodayTasks.length} item${dueTodayTasks.length === 1 ? '' : 's'} due today. Begin with ${nextTitle}${courseName ? ` for ${courseName}` : ''}.`
            : dueThisWeekTasks.length
                ? `Nothing else is due today. You have ${dueThisWeekTasks.length} item${dueThisWeekTasks.length === 1 ? '' : 's'} due later this week; start early on ${nextTitle}.`
        : 'You’re all caught up on dated work for this week. Use a focus block to review notes or plan ahead.';
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
    card.innerHTML = `<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0"><p class="text-xs font-black uppercase tracking-widest text-violet-700 dark:text-violet-300">DueVinci Pro · Daily Brief</p><h3 class="mt-1 text-lg font-black text-zinc-900 dark:text-white">A clear next step for today</h3><p class="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">${escapeHtml(focusLine)}</p></div><button type="button" onclick="openWeeklyPlan()" class="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700">Adjust my plan</button></div><div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${overdueTasks.length}</b><span class="text-xs text-zinc-500">overdue</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${dueTodayTasks.length}</b><span class="text-xs text-zinc-500">due today</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${dueThisWeekTasks.length}</b><span class="text-xs text-zinc-500">due later this week</span></div><div class="rounded-xl bg-white/75 p-3 dark:bg-brand-900/60"><b class="block text-lg dark:text-white">${eventCount}</b><span class="text-xs text-zinc-500">calendar events today</span></div></div>`;
    applyDashboardWidgetLayout();
}

export async function completeTodayTask(taskId, courseId = null, taskType = '', title = '', estimatedMinutes = null) {
    if (taskId == null) return false;
    const hasCompletedTimer = hasCompletedTaskTimerSession(taskId);
    let selfReportedMinutes = null;
    if (!hasCompletedTimer) {
        const response = await requestApproximateStudyMinutes(title);
        if (!response.confirmed) return false;
        selfReportedMinutes = response.minutes;
    }

    const { data: updated, error } = await supabaseClient.from('assignments')
        .update({ is_completed: true, progress_percent: 100 })
        .eq('id', taskId)
        .select('id')
        .maybeSingle();
    if (error || !updated) {
        const status = document.getElementById('todayCompletionStatus');
        if (status) status.textContent = 'This assignment was not saved. Check your connection and try again.';
        return false;
    }
    consumeCompletedTaskTimerMarker(taskId);
    recordStudyActivity();
    const completedAt = new Date().toISOString();
    await recordStudyPlanCompletionIfEntitled({ taskId, courseId, taskType, title, estimatedMinutes, completedAt });
    if (selfReportedMinutes !== null) {
        await recordSelfReportedStudyMinutesIfEntitled({ taskId, minutes: selfReportedMinutes, reportedAt: completedAt });
    }
    fireConfetti();
    const browserWindow = typeof window !== 'undefined' ? window : null;
    await Promise.all([
        renderTodayWorkspace(),
        browserWindow?.renderAcademicsDashboardWidget?.('dashboardGrid'),
        browserWindow?.renderWeeklyReview?.(),
    ]);
    await browserWindow?.loadDashboardStats?.();
    return true;
}
export function startTodayFocus(minutes = 25, taskId = null, courseId = null, taskType = '', title = '', estimatedMinutes = null) {
    startStudyPlanTimer(minutes, title, taskId, courseId, taskType, estimatedMinutes || minutes);
}
if (typeof window !== 'undefined') {
    Object.assign(window, { renderTodayWorkspace, renderAdaptiveDailyBrief, completeTodayTask, startTodayFocus });
    window.addEventListener('duevinci:data-synced', () => {
        renderTodayWorkspace();
        window.loadDashboardStats?.();
    });
    window.addEventListener('storage', (event) => {
        if (!event.key?.startsWith('duevinci_offline:mutation_signal:')) return;
        renderTodayWorkspace();
        window.loadDashboardStats?.();
    });
}
