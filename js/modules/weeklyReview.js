import { supabaseClient } from './config.js';
import { generateBalancedStudyPlan, getRestDays } from './studyPlan.js';

export function summarizeWeeklyPlan(plan = [], assignments = []) {
    const totalMinutes = plan.reduce((sum, day) => sum + (day.totalMinutes || 0), 0);
    const activeDays = plan.filter((day) => !day.isRestDay && (day.totalMinutes || 0) > 0).length;
    const heaviest = [...plan].sort((a, b) => (b.totalMinutes || 0) - (a.totalMinutes || 0))[0] || null;
    const overloaded = plan.filter((day) => (day.totalMinutes || 0) > 120);
    const upcoming = assignments.filter((task) => !task.is_completed && task.due_date).length;
    return { totalMinutes, activeDays, heaviest, overloaded, upcoming, completed: assignments.filter((task) => task.is_completed).length };
}

export async function renderWeeklyReview() {
    if (typeof document === 'undefined') return;
    const dashboard = document.getElementById('dashboardGrid');
    if (!dashboard) return;
    const [{ data: courses }, { data: assignments }] = await Promise.all([supabaseClient.from('courses').select('*'), supabaseClient.from('assignments').select('*')]);
    const plan = generateBalancedStudyPlan(courses || [], assignments || [], new Date(), 7, getRestDays());
    const summary = summarizeWeeklyPlan(plan, assignments || []);
    let card = document.getElementById('weeklyReviewCard');
    if (!card) { card = document.createElement('section'); card.id = 'weeklyReviewCard'; dashboard.appendChild(card); }
    const workload = summary.overloaded.length ? `${summary.overloaded.length} day${summary.overloaded.length > 1 ? 's are' : ' is'} above 2 hours—consider moving lower-priority work.` : summary.totalMinutes ? 'Your workload is balanced around your available study days.' : 'Add due dates to generate a personalized weekly plan.';
    card.className = 'mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-brand-700 dark:bg-brand-800';
    card.innerHTML = `<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p class="text-xs font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Weekly review</p><h3 class="mt-1 text-lg font-black text-zinc-900 dark:text-white">Plan a calmer week</h3><p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">${workload}</p></div><button type="button" onclick="openWeeklyPlan()" class="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700">Plan my week</button></div><div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><div class="rounded-xl bg-zinc-50 p-3 dark:bg-brand-900"><b class="block text-lg dark:text-white">${summary.totalMinutes}m</b><span class="text-xs text-zinc-500">planned focus</span></div><div class="rounded-xl bg-zinc-50 p-3 dark:bg-brand-900"><b class="block text-lg dark:text-white">${summary.activeDays}</b><span class="text-xs text-zinc-500">study days</span></div><div class="rounded-xl bg-zinc-50 p-3 dark:bg-brand-900"><b class="block text-lg dark:text-white">${summary.upcoming}</b><span class="text-xs text-zinc-500">open tasks</span></div><div class="rounded-xl bg-zinc-50 p-3 dark:bg-brand-900"><b class="block text-lg dark:text-white">${summary.completed}</b><span class="text-xs text-zinc-500">completed total</span></div></div>`;
}

export function openWeeklyPlan() { document.getElementById('studyPlanWidgetContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.renderStudyPlanDashboardWidget?.('studyPlanWidgetContainer'); }
if (typeof window !== 'undefined') Object.assign(window, { renderWeeklyReview, openWeeklyPlan });
