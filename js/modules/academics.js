// --- DYNAMIC ACADEMICS, STUDY STREAK, GPA & WORKLOAD RADAR ---
import { supabaseClient } from './config.js';
import { escapeHtml, escapeInlineJs, getSafeExternalUrl, getLocalDateKey } from './utils.js';
export { getLocalDateKey } from './utils.js';

/** Normalizes database due dates, including ISO timestamps, to their calendar-date key. */
export function getDueDateKey(dueDate) {
    if (dueDate === null || dueDate === undefined) return '';
    const key = String(dueDate).split('T')[0].trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

/**
 * Calculates consecutive study days from an array of ISO date strings (YYYY-MM-DD).
 */
export function calculateStudyStreak(activityDates = [], baseDate = new Date()) {
    if (!Array.isArray(activityDates) || activityDates.length === 0) return 0;

    let streakDays = 0;
    let checkDate = new Date(baseDate);

    let currentDateStr = getLocalDateKey(checkDate);
    if (!activityDates.includes(currentDateStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
        currentDateStr = getLocalDateKey(checkDate);
    }

    while (activityDates.includes(currentDateStr)) {
        streakDays++;
        checkDate.setDate(checkDate.getDate() - 1);
        currentDateStr = getLocalDateKey(checkDate);
    }

    return streakDays;
}

/**
 * Calculates difference in days from baseDate to dueDate (YYYY-MM-DD).
 */
export function calculateDaysRemaining(dueDateStr, baseDate = new Date()) {
    if (!dueDateStr) return 0;
    const cleanDateStr = String(dueDateStr).split('T')[0].trim();
    const due = new Date(cleanDateStr + 'T00:00:00');
    const base = new Date(baseDate);
    base.setHours(0, 0, 0, 0);
    if (isNaN(due.getTime()) || isNaN(base.getTime())) return 0;
    const diffTime = due.getTime() - base.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Categorizes daily workload intensity based on task count and exam presence.
 */
export function getWorkloadIntensity(dayTasks = 0, hasExam = false) {
    if (hasExam) {
        return {
            intensityClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700 animate-pulse',
            statusLabel: '🔥 Exam'
        };
    }
    if (dayTasks >= 4) {
        return {
            intensityClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800',
            statusLabel: `${dayTasks} Tasks`
        };
    }
    if (dayTasks >= 2) {
        return {
            intensityClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
            statusLabel: `${dayTasks} Tasks`
        };
    }
    if (dayTasks === 1) {
        return {
            intensityClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
            statusLabel: '1 Task'
        };
    }
    return {
        intensityClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        statusLabel: 'Chill'
    };
}

/**
 * Builds the data behind the seven-day workload radar.
 * Due-date timestamps are treated as the same calendar date as date-only values.
 */
export function getSevenDayWorkload(assignments = [], startDate = new Date(), daysAhead = 7, isExamTask = () => false) {
    if (!Array.isArray(assignments) || !Number.isInteger(daysAhead) || daysAhead < 1) return [];

    const start = new Date(startDate);
    if (isNaN(start.getTime())) return [];
    start.setHours(0, 0, 0, 0);

    return Array.from({ length: daysAhead }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const dateKey = getLocalDateKey(date);
        const tasks = assignments.filter(a => !a.is_completed && getDueDateKey(a.due_date) === dateKey);
        const hasExam = tasks.some(isExamTask);
        return { date: dateKey, dayTasks: tasks.length, hasExam, intensity: getWorkloadIntensity(tasks.length, hasExam) };
    });
}

/**
 * Calculates cumulative GPA across courses given percentage averages and a scale (4.0 or 5.0).
 */
export function calculateCumulativeGpa(courseAverages = [], scale = 4.0) {
    const valid = courseAverages.filter(g => typeof g === 'number' && !isNaN(g) && g >= 0);
    if (valid.length === 0) return '0.00';
    const sum = valid.reduce((acc, v) => acc + v, 0);
    const avg = sum / valid.length;
    const gpa = (avg / 100) * scale;
    return gpa.toFixed(2);
}

export async function renderAcademicsDashboardWidget(containerId) {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('duevinci_hide_academics') === 'true') {
        if (typeof document !== 'undefined') {
            document.querySelectorAll('#academicsAnalyticsWidget').forEach(el => el.remove());
        }
        return;
    }

    if (typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

    // Purge existing instances to prevent doubling
    document.querySelectorAll('#academicsAnalyticsWidget').forEach(el => el.remove());

    let completedCount = 0;
    let totalCount = 0;
    let examCountdownsHtml = '';
    let assignmentsData = [];

    let localTypes = {};
    try {
        if (typeof localStorage !== 'undefined') {
            localTypes = JSON.parse(localStorage.getItem('duevinci_assignment_types') || '{}');
        }
    } catch (e) {}

    try {
        if (supabaseClient) {
            const { data: assignments, error } = await supabaseClient.from('assignments').select('*');
            if (assignments && !error) {
                assignmentsData = assignments;
            }
        }
    } catch (e) {
        console.warn("Direct assignments query notice:", e);
    }

    // Fallback to local memory / localCourses
    if (assignmentsData.length === 0 && typeof window !== 'undefined' && Array.isArray(window.localCourses)) {
        window.localCourses.forEach(c => {
            if (Array.isArray(c.assignments)) {
                c.assignments.forEach(a => assignmentsData.push({ ...a, course_id: a.course_id || c.id }));
            }
        });
    }

    const isExamTask = (a) => {
        const explicitType = localTypes[a.id] || a.task_type || a.type;
        if (explicitType === 'exam') return true;
        if (!explicitType) {
            return /(exam|final|midterm|test|quiz)/i.test(a.title);
        }
        return false;
    };

    if (assignmentsData.length > 0) {
        const validItems = assignmentsData.filter(a => {
            const title = String(a.title || '');
            return title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(title);
        });
        totalCount = validItems.length;
        completedCount = validItems.filter(a => a.is_completed).length;

        const uncompletedExams = assignmentsData
            .filter(a => !a.is_completed && isExamTask(a) && a.due_date)
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

        if (uncompletedExams.length > 0) {
            examCountdownsHtml = uncompletedExams.map(exam => {
                const cleanTitle = (exam.title || '').replace(/^↳\s*/, '').trim();
                const diffDays = calculateDaysRemaining(exam.due_date);
                let badgeColor = 'text-rose-500 font-bold';
                let timeText = '';
                if (diffDays < 0) {
                    timeText = `Overdue (${Math.abs(diffDays)}d ago)`;
                    badgeColor = 'text-red-600 font-extrabold';
                } else if (diffDays === 0) {
                    timeText = `🔥 Due Today!`;
                    badgeColor = 'text-rose-600 font-extrabold animate-pulse';
                } else if (diffDays === 1) {
                    timeText = `⚡ Tomorrow (1d)`;
                    badgeColor = 'text-amber-500 font-bold';
                } else {
                    timeText = `in ${diffDays} Days`;
                    badgeColor = 'text-zinc-600 dark:text-zinc-300 font-medium';
                }
                return `
                    <div class="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center justify-between gap-1 py-0.5 truncate" title="${cleanTitle}">
                        <span class="truncate">🎯 ${cleanTitle}</span>
                        <span class="shrink-0 text-[11px] ${badgeColor}">${timeText}</span>
                    </div>
                `;
            }).join('');
        } else {
            examCountdownsHtml = `<p class="text-xs text-zinc-400 py-1">No active exams or finals pending. 🎉</p>`;
        }
    } else {
        examCountdownsHtml = `<p class="text-xs text-zinc-400 py-1">No active exams or finals pending. 🎉</p>`;
    }

    let streakDays = 0;
    try {
        const activityDates = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('duevinci_activity_dates'))) || [];
        streakDays = calculateStudyStreak(activityDates);
    } catch (err) {
        console.error("Error calculating streak:", err);
    }

    let workloadHtml = '';
    try {
        const now = new Date();
        const radarDays = getSevenDayWorkload(assignmentsData, now, 7, isExamTask);
        const days = radarDays.map((radarDay, i) => {
            const d = new Date(now);
            d.setDate(now.getDate() + i);
            const dayName = i === 0 ? 'Today' : (i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' }));
            const displayDate = `${d.getMonth() + 1}/${d.getDate()}`;
            const intensity = radarDay.intensity;
            return `
                <div class="flex-1 min-w-[70px] p-2 rounded-lg border text-center ${intensity.intensityClass} transition hover:scale-105">
                    <div class="text-[10px] font-bold uppercase tracking-wider opacity-75">${dayName}</div>
                    <div class="text-xs font-black my-0.5">${displayDate}</div>
                    <div class="text-[10px] font-bold truncate">${intensity.statusLabel}</div>
                </div>
            `;
        });
        workloadHtml = `
            <div class="mt-4 pt-4 border-t border-zinc-200 dark:border-brand-700">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <span>📊</span> 7-Day Workload & Stress Radar
                    </span>
                    <span class="text-[11px] text-zinc-400">Green = Light • Amber = Moderate • Red = Exam/Heavy</span>
                </div>
                <div class="flex gap-2 overflow-x-auto pb-1">
                    ${days.join('')}
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Error calculating workload radar:", err);
    }

    const analyticsDiv = document.createElement('div');
    analyticsDiv.id = 'academicsAnalyticsWidget';
    analyticsDiv.className = 'mb-6 bg-white dark:bg-brand-800 p-5 rounded-2xl border border-zinc-200 dark:border-brand-700 shadow-sm';
    analyticsDiv.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/80 dark:border-brand-700">
                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Study Streak</h4>
                <p class="text-2xl font-extrabold text-emerald-500">🔥 ${streakDays} Day${streakDays === 1 ? '' : 's'}</p>
            </div>
            <div class="p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/80 dark:border-brand-700">
                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Tasks Completed</h4>
                <p id="tasksCompletedCount" class="text-2xl font-extrabold text-amber-500">${completedCount} / ${totalCount}</p>
            </div>
            <div class="p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/80 dark:border-brand-700">
                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Exams & Finals Countdown</h4>
                <div class="mt-1 space-y-1 max-h-20 overflow-y-auto pr-1">
                    ${examCountdownsHtml}
                </div>
            </div>
        </div>
        ${workloadHtml}
    `;

    const headerTitle = container.querySelector('.flex.justify-between.items-end') || container.querySelector('.flex.flex-col') || container.firstElementChild;
    if (headerTitle && headerTitle.nextSibling) {
        container.insertBefore(analyticsDiv, headerTitle.nextSibling);
    } else {
        container.insertBefore(analyticsDiv, container.firstChild);
    }
}

export function injectAcademicsSettingsToggle() {
    // Workspace visibility is rendered centrally by ui.js.
    document.getElementById('academicsToggleContainer')?.remove();
}

export function toggleAcademicsVisibility(show) {
    if (typeof localStorage === 'undefined') return;
    if (show) {
        localStorage.removeItem('duevinci_hide_academics');
        if (typeof renderAcademicsDashboardWidget === 'function') {
            renderAcademicsDashboardWidget('dashboardGrid');
        }
    } else {
        localStorage.setItem('duevinci_hide_academics', 'true');
        if (typeof document !== 'undefined') {
            document.querySelectorAll('#academicsAnalyticsWidget').forEach(el => el.remove());
        }
    }
}

export function renderResourceLinksSection(courseId, containerId) {
    if (typeof document === 'undefined') return;
    let container = document.getElementById(containerId);
    if (!container) {
        const targetModalBody = document.querySelector('#courseModal .overflow-y-auto > div:first-child');
        if (targetModalBody) {
            container = document.createElement('div');
            container.id = containerId;
            targetModalBody.appendChild(container);
        } else {
            return;
        }
    }

    let savedLinks = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem(`resources_${courseId}`))) || [
        { title: 'GitHub Repository', url: 'https://github.com' },
        { title: 'Official Documentation', url: 'https://developer.mozilla.org' }
    ];

    let html = `<div class="space-y-3 mt-4 pt-4 border-t border-zinc-200 dark:border-brand-700"><h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-300">🔗 Resource & Note Links</h3><div class="space-y-2">`;
    savedLinks.forEach((link, idx) => {
        const safeUrl = getSafeExternalUrl(link.url);
        const label = escapeHtml(link.title);
        const linkHtml = safeUrl
            ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="font-bold text-indigo-500 hover:underline truncate">${label}</a>`
            : `<span class="text-zinc-500 truncate">${label} <em>(invalid link)</em></span>`;
        html += `<div class="flex items-center justify-between p-2 bg-zinc-100 dark:bg-brand-900 rounded-lg text-xs">${linkHtml}<button onclick="removeResourceLink('${escapeInlineJs(courseId)}', ${idx})" class="text-zinc-400 hover:text-red-500 font-bold px-1">✕</button></div>`;
    });
    html += `</div><div class="flex gap-2 mt-2"><input type="text" id="resTitle_${courseId}" placeholder="Title" class="w-1/3 text-xs px-2 py-1.5 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500"><input type="url" id="resUrl_${courseId}" placeholder="https://..." class="flex-1 text-xs px-2.5 py-1.5 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500"><button onclick="addResourceLink('${courseId}')" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-bold transition">+ Add</button></div></div>`;
    container.innerHTML = html;
}

export function addResourceLink(courseId) {
    if (typeof document === 'undefined') return;
    const titleInput = document.getElementById(`resTitle_${courseId}`);
    const urlInput = document.getElementById(`resUrl_${courseId}`);
    const title = titleInput ? titleInput.value.trim() : '';
    const url = getSafeExternalUrl(urlInput ? urlInput.value : '');
    if (!title || !url) {
        alert('Please enter a valid http:// or https:// resource link.');
        return;
    }

    let savedLinks = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem(`resources_${courseId}`))) || [];
    savedLinks.push({ title, url });
    if (typeof localStorage !== 'undefined') localStorage.setItem(`resources_${courseId}`, JSON.stringify(savedLinks));
    renderResourceLinksSection(courseId, 'courseResourceSection');
}

export function removeResourceLink(courseId, index) {
    if (typeof document === 'undefined') return;
    let savedLinks = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem(`resources_${courseId}`))) || [];
    savedLinks.splice(index, 1);
    if (typeof localStorage !== 'undefined') localStorage.setItem(`resources_${courseId}`, JSON.stringify(savedLinks));
    renderResourceLinksSection(courseId, 'courseResourceSection');
}

const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.calculateStudyStreak = calculateStudyStreak;
_scope.calculateDaysRemaining = calculateDaysRemaining;
_scope.getWorkloadIntensity = getWorkloadIntensity;
_scope.calculateCumulativeGpa = calculateCumulativeGpa;
_scope.renderAcademicsDashboardWidget = renderAcademicsDashboardWidget;
_scope.injectAcademicsSettingsToggle = injectAcademicsSettingsToggle;
_scope.toggleAcademicsVisibility = toggleAcademicsVisibility;
_scope.renderResourceLinksSection = renderResourceLinksSection;
_scope.addResourceLink = addResourceLink;
_scope.removeResourceLink = removeResourceLink;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(injectAcademicsSettingsToggle, 400);
    });
}
