// --- GRADES, CREDIT-WEIGHTED GPA & "WHAT-IF" CALCULATOR MODULE ---
import { supabaseClient } from './config.js';
import { escapeHtml } from './utils.js';
import { getStudyCalibrationHistory, isStudyCalibrationEnabled } from './studyCalibration.js';

const DEFAULT_GRADE_CATEGORIES = [{ id: 'coursework', name: 'Coursework', weight: 100 }];
const MAX_GRADE_CATEGORIES = 12;
const DEFAULT_CREDIT_HOURS = 3;
const TERM_INSIGHTS_WINDOW_DAYS = 90;
const MIN_GRADE_TREND_ITEMS = 6;
const MIN_FOCUS_INSIGHT_SESSIONS = 3;
const MIN_FOCUS_INSIGHT_DAYS = 2;

export let isSimulatingGrades = false;
export let simulatedGradesMap = {};
let loadedAssignments = [];

function parsePercent(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parseCreditHours(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : null;
}

export function getGradeCategories(course) {
    const rawCategories = course?.grade_categories;
    if (!Array.isArray(rawCategories) || rawCategories.length === 0 || rawCategories.length > MAX_GRADE_CATEGORIES) {
        return DEFAULT_GRADE_CATEGORIES.map((category) => ({ ...category }));
    }

    const categories = [];
    const seenIds = new Set();
    const seenNames = new Set();
    let totalWeight = 0;
    for (const rawCategory of rawCategories) {
        const id = typeof rawCategory?.id === 'string' ? rawCategory.id.trim() : '';
        const name = typeof rawCategory?.name === 'string' ? rawCategory.name.trim() : '';
        const weight = Number(rawCategory?.weight);
        const normalizedName = name.toLocaleLowerCase();
        if (!id || id.length > 80 || !name || name.length > 40 || !Number.isFinite(weight) || weight < 0 || weight > 100
            || seenIds.has(id) || seenNames.has(normalizedName)) {
            return DEFAULT_GRADE_CATEGORIES.map((category) => ({ ...category }));
        }
        seenIds.add(id);
        seenNames.add(normalizedName);
        totalWeight += weight;
        categories.push({ id, name, weight });
    }
    if (Math.abs(totalWeight - 100) > 0.01) return DEFAULT_GRADE_CATEGORIES.map((category) => ({ ...category }));
    return categories;
}

export function getCourseCreditHours(course) {
    return parseCreditHours(course?.credit_hours) ?? DEFAULT_CREDIT_HOURS;
}

function getAssignmentCategoryId(assignment, categories) {
    const categoryId = typeof assignment?.grade_category_id === 'string' ? assignment.grade_category_id : '';
    return categories.some((category) => category.id === categoryId) ? categoryId : categories[0].id;
}

function getActiveAssignmentGrade(assignment, gradeOverrides) {
    const hasOverride = gradeOverrides && Object.prototype.hasOwnProperty.call(gradeOverrides, assignment?.id);
    return parsePercent(hasOverride ? gradeOverrides[assignment.id] : assignment?.grade);
}

export function calculateCourseAverage(assignments = [], course = {}, gradeOverrides = {}) {
    if (!Array.isArray(assignments)) return null;
    const categories = getGradeCategories(course);
    const categoryScores = new Map(categories.map((category) => [category.id, []]));
    for (const assignment of assignments) {
        if (!assignment || assignment.exclude_from_gpa) continue;
        const grade = getActiveAssignmentGrade(assignment, gradeOverrides);
        if (grade === null) continue;
        categoryScores.get(getAssignmentCategoryId(assignment, categories)).push(grade);
    }

    let weightedTotal = 0;
    let activeWeight = 0;
    for (const category of categories) {
        const scores = categoryScores.get(category.id);
        if (!scores.length || category.weight <= 0) continue;
        const categoryAverage = scores.reduce((total, score) => total + score, 0) / scores.length;
        weightedTotal += categoryAverage * category.weight;
        activeWeight += category.weight;
    }
    return activeWeight > 0 ? weightedTotal / activeWeight : null;
}

export function calculateCreditWeightedGpa(courseGrades = [], scale = 4) {
    if (!Array.isArray(courseGrades)) return null;
    const validScale = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 4;
    let weightedPoints = 0;
    let totalCredits = 0;
    for (const entry of courseGrades) {
        const average = parsePercent(entry?.averagePercent ?? entry?.average);
        if (average === null) continue;
        const credits = parseCreditHours(entry?.creditHours ?? entry?.credit_hours) ?? DEFAULT_CREDIT_HOURS;
        weightedPoints += (average / 100) * validScale * credits;
        totalCredits += credits;
    }
    return totalCredits > 0 ? weightedPoints / totalCredits : null;
}

export function calculateRequiredAssessmentScore({ assignments = [], course = {}, targetPercent, categoryId } = {}) {
    const target = parsePercent(targetPercent);
    if (target === null) return { status: 'invalid-target' };
    if (!Array.isArray(assignments)) return { status: 'no-data' };
    const categories = getGradeCategories(course);
    const targetCategory = categories.find((category) => category.id === categoryId);
    if (!targetCategory) return { status: 'invalid-category' };
    if (targetCategory.weight <= 0) return { status: 'zero-weight', categoryName: targetCategory.name };

    const scoresByCategory = new Map(categories.map((category) => [category.id, []]));
    for (const assignment of assignments) {
        if (!assignment || assignment.exclude_from_gpa) continue;
        const grade = parsePercent(assignment.grade);
        if (grade === null) continue;
        scoresByCategory.get(getAssignmentCategoryId(assignment, categories)).push(grade);
    }
    const targetScores = scoresByCategory.get(targetCategory.id);
    let activeWeight = 0;
    let otherWeightedTotal = 0;
    for (const category of categories) {
        const scores = scoresByCategory.get(category.id);
        const isActive = scores.length > 0 || category.id === targetCategory.id;
        if (!isActive || category.weight <= 0) continue;
        activeWeight += category.weight;
        if (category.id !== targetCategory.id) {
            otherWeightedTotal += (scores.reduce((total, score) => total + score, 0) / scores.length) * category.weight;
        }
    }
    if (activeWeight <= 0) return { status: 'no-active-weight', categoryName: targetCategory.name };
    const targetCategoryTotal = targetScores.reduce((total, score) => total + score, 0);
    const required = (target * activeWeight - otherWeightedTotal) * (targetScores.length + 1) / targetCategory.weight - targetCategoryTotal;
    if (!Number.isFinite(required)) return { status: 'no-data' };
    if (required <= 0) return { status: 'already-met', required: 0, categoryName: targetCategory.name };
    if (required > 100) return { status: 'unreachable', required, categoryName: targetCategory.name };
    return { status: 'possible', required, categoryName: targetCategory.name };
}

export function calculateTermInsights({ assignments = [], studyHistory = null, now = Date.now(), windowDays = TERM_INSIGHTS_WINDOW_DAYS } = {}) {
    const nowMs = typeof now === 'number' ? now : Date.parse(now);
    const validWindowDays = Number.isFinite(Number(windowDays)) && Number(windowDays) > 0
        ? Math.min(365, Number(windowDays))
        : TERM_INSIGHTS_WINDOW_DAYS;
    const windowMs = validWindowDays * 24 * 60 * 60 * 1000;
    const cutoff = Number.isFinite(nowMs) ? nowMs - windowMs : Date.now() - windowMs;
    const end = Number.isFinite(nowMs) ? nowMs : Date.now();
    const gradedItems = (Array.isArray(assignments) ? assignments : []).flatMap((assignment) => {
        if (!assignment || assignment.exclude_from_gpa) return [];
        const grade = parsePercent(assignment.grade);
        const dueAt = Date.parse(assignment.due_date || '');
        if (grade === null || !Number.isFinite(dueAt) || dueAt < cutoff || dueAt > end) return [];
        return [{ grade, dueAt }];
    }).sort((a, b) => a.dueAt - b.dueAt);

    let gradeTrend = { status: 'insufficient', gradedItemCount: gradedItems.length, minimumItems: MIN_GRADE_TREND_ITEMS };
    if (gradedItems.length >= MIN_GRADE_TREND_ITEMS) {
        const midpoint = Math.floor(gradedItems.length / 2);
        const earlier = gradedItems.slice(0, midpoint);
        const later = gradedItems.slice(midpoint);
        const earlierAverage = earlier.reduce((sum, item) => sum + item.grade, 0) / earlier.length;
        const laterAverage = later.reduce((sum, item) => sum + item.grade, 0) / later.length;
        const change = laterAverage - earlierAverage;
        gradeTrend = {
            status: 'ready',
            gradedItemCount: gradedItems.length,
            earlierCount: earlier.length,
            laterCount: later.length,
            earlierAverage,
            laterAverage,
            change,
            direction: change > 0.5 ? 'higher' : change < -0.5 ? 'lower' : 'steady'
        };
    }

    if (!studyHistory || !Array.isArray(studyHistory.sessions)) {
        return {
            windowDays: validWindowDays,
            gradeTrend,
            focus: { status: 'disabled', sessionCount: 0, activeDayCount: 0, totalMinutes: 0, averageMinutes: 0, mostActiveWeekday: null }
        };
    }
    const validSessions = studyHistory.sessions.flatMap((session) => {
        const recordedAt = Date.parse(session?.recordedAt || '');
        const minutes = Number(session?.minutes);
        if (!Number.isFinite(recordedAt) || recordedAt < cutoff || recordedAt > end
            || !Number.isFinite(minutes) || minutes < 1 || minutes > 240) return [];
        return [{ recordedAt, minutes }];
    });
    const activeDates = new Set();
    const weekdayCounts = new Map();
    validSessions.forEach(({ recordedAt }) => {
        const date = new Date(recordedAt);
        activeDates.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
        const weekday = date.getDay();
        weekdayCounts.set(weekday, (weekdayCounts.get(weekday) || 0) + 1);
    });
    const totalMinutes = validSessions.reduce((sum, session) => sum + session.minutes, 0);
    const ready = validSessions.length >= MIN_FOCUS_INSIGHT_SESSIONS && activeDates.size >= MIN_FOCUS_INSIGHT_DAYS;
    let mostActiveWeekday = null;
    if (ready && weekdayCounts.size) {
        const sortedWeekdays = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        if (sortedWeekdays.length === 1 || sortedWeekdays[0][1] > sortedWeekdays[1][1]) {
            mostActiveWeekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date(2020, 0, 5 + sortedWeekdays[0][0]));
        }
    }
    return {
        windowDays: validWindowDays,
        gradeTrend,
        focus: {
            status: ready ? 'ready' : 'insufficient',
            sessionCount: validSessions.length,
            activeDayCount: activeDates.size,
            totalMinutes,
            averageMinutes: validSessions.length ? totalMinutes / validSessions.length : 0,
            mostActiveWeekday
        }
    };
}

function getGpaScaleTarget() {
    const storedScale = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('duevinci_gpa_scale')) : 4;
    return storedScale === 5 ? 5 : 4;
}

function getCourseCategoriesFromCard(courseCard) {
    try {
        return getGradeCategories({ grade_categories: JSON.parse(courseCard?.dataset.gradeCategories || '[]') });
    } catch {
        return getGradeCategories({});
    }
}

function getAssignmentsFromCard(courseCard) {
    if (!courseCard) return [];
    return Array.from(courseCard.querySelectorAll('[data-grade-row]')).map((row) => {
        const gradeInput = row.querySelector('[data-sim-grade-input]');
        const categoryInput = row.querySelector('[data-grade-category]');
        const excludeInput = row.querySelector('[data-grade-exclude]');
        return {
            id: gradeInput?.dataset.assignmentId || '',
            grade: parsePercent(gradeInput?.value),
            grade_category_id: categoryInput?.value || '',
            exclude_from_gpa: Boolean(excludeInput?.checked)
        };
    });
}

function setStatus(statusElement, message, isError = false) {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.className = isError
        ? 'mt-2 text-xs text-rose-700 dark:text-rose-300'
        : 'mt-2 text-xs text-zinc-500 dark:text-zinc-400';
    statusElement.setAttribute('role', isError ? 'alert' : 'status');
}

function setCourseStatusFromControl(control, message, isError = false) {
    const courseCard = control?.closest('[data-grade-course]');
    setStatus(courseCard?.querySelector('[data-grade-course-status]'), message, isError);
}

function updateGradeSummaries() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('gradesContainer');
    if (!container) return;
    const cumulativeEntries = [];
    container.querySelectorAll('[data-grade-course]').forEach((courseCard) => {
        const average = calculateCourseAverage(getAssignmentsFromCard(courseCard), {
            grade_categories: getCourseCategoriesFromCard(courseCard)
        });
        const averageElement = courseCard.querySelector('[data-course-average]');
        if (averageElement) averageElement.textContent = `Course Average: ${average === null ? 'N/A' : `${average.toFixed(1)}%`}`;
        if (average !== null) {
            cumulativeEntries.push({
                averagePercent: average,
                creditHours: getCourseCreditHours({ credit_hours: courseCard.dataset.creditHours })
            });
        }
    });
    const cumulativeEl = document.getElementById('cumulativeGpaVal');
    if (!cumulativeEl) return;
    const scaleTarget = getGpaScaleTarget();
    const gpa = calculateCreditWeightedGpa(cumulativeEntries, scaleTarget);
    cumulativeEl.textContent = gpa === null ? 'N/A' : `${gpa.toFixed(2)} / ${scaleTarget.toFixed(1)}`;
}

function recalculateGradeSimulatorDisplay() {
    updateGradeSummaries();
}

function renderGradeCategoryOptions(categories, selectedId) {
    return categories.map((category) => `
        <option value="${escapeHtml(category.id)}" ${category.id === selectedId ? 'selected' : ''}>${escapeHtml(category.name)}</option>
    `).join('');
}

function renderGradeCategoryRow(category, assignmentCount = 0) {
    const categoryId = escapeHtml(category.id || '');
    const categoryName = escapeHtml(category.name || '');
    const weight = category.weight === '' || category.weight === undefined ? '' : escapeHtml(category.weight);
    const removeLabel = category.name ? `Remove ${category.name} category` : 'Remove new category';
    const cannotRemove = assignmentCount > 0;
    return `
        <div data-grade-category-row data-category-id="${categoryId}" class="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2">
            <label class="min-w-0">
                <span class="sr-only">Category name</span>
                <input type="text" data-category-name maxlength="40" value="${categoryName}" placeholder="e.g. Exams" class="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-brand-600 dark:bg-brand-900 dark:text-zinc-100">
            </label>
            <label>
                <span class="sr-only">Weight percent</span>
                <input type="number" data-category-weight min="0" max="100" step="0.1" value="${weight}" aria-label="${categoryName ? `${categoryName} weight percent` : 'New category weight percent'}" class="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-brand-600 dark:bg-brand-900 dark:text-zinc-100">
            </label>
            <button type="button" onclick="removeGradeCategoryRow(this)" aria-label="${escapeHtml(removeLabel)}" title="${cannotRemove ? 'Reassign coursework in this category before removing it.' : removeLabel}" ${cannotRemove ? 'disabled' : ''} class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-300 px-2 text-xs text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-600 dark:text-zinc-200 dark:hover:bg-brand-700">Remove</button>
            ${cannotRemove ? `<span class="col-span-3 text-[11px] text-zinc-500 dark:text-zinc-400">${assignmentCount} coursework item${assignmentCount === 1 ? '' : 's'} assigned; reassign them first.</span>` : ''}
        </div>`;
}

function renderGradeSettings(course, courseAssignments) {
    const categories = getGradeCategories(course);
    const courseId = escapeHtml(course.id);
    const categoryRows = categories.map((category) => {
        const assignmentCount = courseAssignments.filter((assignment) => assignment.grade_category_id === category.id).length;
        return renderGradeCategoryRow(category, assignmentCount);
    }).join('');
    return `
        <details class="mt-5 border-t border-zinc-200 pt-4 dark:border-brand-700" data-grade-settings data-course-id="${courseId}" id="gradeSettings-${courseId}">
            <summary class="min-h-11 cursor-pointer py-2 text-sm font-semibold text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-zinc-200">Grade settings</summary>
            <form class="mt-3 space-y-4" data-grade-settings-form data-course-id="${courseId}" onsubmit="saveCourseGradeSettings(event)">
                <div class="max-w-sm">
                    <label class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300" for="gradeCredits-${courseId}">Credit hours</label>
                    <input id="gradeCredits-${courseId}" data-course-credit-hours type="number" min="0.01" max="100" step="0.01" required value="${escapeHtml(getCourseCreditHours(course))}" class="mt-1 min-h-11 w-32 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-800 dark:border-brand-600 dark:bg-brand-900 dark:text-zinc-100">
                    <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Used to weight this course in the cumulative GPA. Existing courses start at 3 credits.</p>
                </div>
                <fieldset class="space-y-2">
                    <legend class="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Category weights</legend>
                    <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                        <span>Category</span><span>Weight %</span><span class="sr-only">Actions</span>
                    </div>
                    <div data-grade-category-list class="space-y-2">${categoryRows}</div>
                    <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Weights must total 100%. Items without a saved category use the first category. Grades within each category count equally because assignment points are not tracked.</p>
                    <button type="button" onclick="addGradeCategory(this)" class="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-brand-600 dark:text-zinc-200 dark:hover:bg-brand-700">Add category</button>
                </fieldset>
                <div class="flex flex-wrap items-center gap-3">
                    <button type="submit" class="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">Save grade settings</button>
                    <span data-grade-settings-summary class="text-xs text-zinc-500 dark:text-zinc-400">${categories.length} categories · ${getCourseCreditHours(course)} credits</span>
                </div>
                <p data-grade-settings-status aria-live="polite" class="text-xs text-zinc-500 dark:text-zinc-400"></p>
            </form>
        </details>`;
}

function renderTargetScoreCalculator(course, categories) {
    const courseId = escapeHtml(course.id);
    const firstCategoryId = categories[0]?.id || DEFAULT_GRADE_CATEGORIES[0].id;
    return `
        <form data-target-score-form data-course-id="${courseId}" onsubmit="calculateTargetScore(event)" class="mt-5 border-t border-zinc-200 pt-4 dark:border-brand-700">
            <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Target score calculator</h4>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Find the score needed on one more item. It assumes that item counts equally with other graded items in its category.</p>
            <div class="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-end">
                <label class="w-full max-w-36 text-xs font-medium text-zinc-700 dark:text-zinc-300">Target course grade (%)
                    <input data-target-percent type="number" min="0" max="100" step="0.1" required inputmode="decimal" class="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-800 dark:border-brand-600 dark:bg-brand-900 dark:text-zinc-100">
                </label>
                <label class="w-full max-w-48 text-xs font-medium text-zinc-700 dark:text-zinc-300">Next item category
                    <select data-target-category class="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-800 dark:border-brand-600 dark:bg-brand-900 dark:text-zinc-100">${renderGradeCategoryOptions(categories, firstCategoryId)}</select>
                </label>
                <button type="submit" class="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-brand-600 dark:text-zinc-200 dark:hover:bg-brand-700">Calculate score</button>
            </div>
            <p data-target-score-result aria-live="polite" class="mt-2 min-h-5 text-sm text-zinc-700 dark:text-zinc-200"></p>
        </form>`;
}

export function renderGradeControlInputs({ item, course, activeGrade, categories = getGradeCategories(course), isSimulatingGrades: isSimulating = false, isSimulatedVal = false }) {
    const assignmentId = escapeHtml(item?.id ?? '');
    const courseId = escapeHtml(course?.id ?? '');
    const courseCode = escapeHtml(course?.code || 'Course');
    const assignmentTitle = escapeHtml(item?.title || 'Coursework item');
    const inputHandler = isSimulating
        ? 'oninput="simulateAssignmentGrade(this.dataset.assignmentId, this.value)"'
        : 'onchange="updateAssignmentGrade(this.dataset.assignmentId, this.value, this)"';
    const inputValue = activeGrade !== null && activeGrade !== undefined ? escapeHtml(activeGrade) : '';
    const savedGrade = item?.grade !== null && item?.grade !== undefined ? escapeHtml(item.grade) : '';
    const selectedCategory = getAssignmentCategoryId(item, categories);
    const categorySelect = `
        <label class="sr-only">${courseCode} ${assignmentTitle} grade category
            <select data-grade-category data-saved-category="${escapeHtml(selectedCategory)}" data-assignment-id="${assignmentId}" aria-label="${courseCode} ${assignmentTitle} grade category" onchange="updateAssignmentGradeCategory(this)" class="min-h-11 max-w-36 rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700 dark:border-brand-600 dark:bg-brand-800 dark:text-zinc-200">${renderGradeCategoryOptions(categories, selectedCategory)}</select>
        </label>`;
    return `
        ${categorySelect}
        <label class="flex min-h-11 min-w-11 items-center gap-1.5 px-2 text-[11px] text-zinc-500 cursor-pointer">
            <input type="checkbox" data-grade-exclude data-saved-excluded="${item?.exclude_from_gpa ? 'true' : 'false'}" data-assignment-id="${assignmentId}" aria-label="Exclude ${courseCode} ${assignmentTitle} from GPA" ${item?.exclude_from_gpa ? 'checked' : ''} onchange="toggleExcludeGpa(this.dataset.assignmentId, this.checked, this)" class="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"> Exclude
        </label>
        <label class="flex items-center gap-1">
            <span class="sr-only">${courseCode} ${assignmentTitle} grade percent</span>
            <input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-sim-grade-input="${isSimulating ? 'true' : 'false'}" data-course-id="${courseId}" data-assignment-id="${assignmentId}" data-saved-grade="${savedGrade}" aria-label="${courseCode} ${assignmentTitle} grade" value="${inputValue}" placeholder="--" ${inputHandler} oninput="this.setCustomValidity('')" class="min-h-11 w-16 rounded-lg border border-zinc-300 p-1 text-center text-xs font-bold text-zinc-800 dark:border-brand-600 dark:bg-brand-800 dark:text-zinc-100 ${isSimulatedVal ? 'border-indigo-500 bg-indigo-50 dark:bg-brand-800 text-indigo-600 font-black' : ''} focus:outline-none focus:border-indigo-500">
            <span class="text-zinc-500">%</span>
        </label>`;
}

export function toggleGradeSimulator() {
    isSimulatingGrades = !isSimulatingGrades;
    if (!isSimulatingGrades) simulatedGradesMap = {};
    loadGradesPage();
}

export function resetGradeSimulation() {
    simulatedGradesMap = {};
    loadGradesPage();
}

export function simulateAssignmentGrade(assignId, gradeVal) {
    const value = parsePercent(gradeVal);
    if (value !== null) simulatedGradesMap[assignId] = value;
    else delete simulatedGradesMap[assignId];
    loadGradesPage(true);
}

export function addGradeCategory(button) {
    const settings = button?.closest('[data-grade-settings]');
    const categoryList = settings?.querySelector('[data-grade-category-list]');
    if (!categoryList) return;
    if (categoryList.querySelectorAll('[data-grade-category-row]').length >= MAX_GRADE_CATEGORIES) {
        setStatus(settings.querySelector('[data-grade-settings-status]'), `A course can have up to ${MAX_GRADE_CATEGORIES} categories.`, true);
        return;
    }
    categoryList.insertAdjacentHTML('beforeend', renderGradeCategoryRow({ id: '', name: '', weight: '' }));
}

export function removeGradeCategoryRow(button) {
    const settings = button?.closest('[data-grade-settings]');
    const categoryList = settings?.querySelector('[data-grade-category-list]');
    const rows = categoryList ? Array.from(categoryList.querySelectorAll('[data-grade-category-row]')) : [];
    if (!button || button.disabled) return;
    if (rows.length <= 1) {
        setStatus(settings?.querySelector('[data-grade-settings-status]'), 'A course must keep at least one grade category.', true);
        return;
    }
    button.closest('[data-grade-category-row]')?.remove();
}

function createGradeCategoryId() {
    const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `category-${randomId}`;
}

export async function saveCourseGradeSettings(event) {
    event?.preventDefault?.();
    const form = event?.currentTarget;
    const settings = form?.closest('[data-grade-settings]');
    const courseId = form?.dataset.courseId;
    const status = form?.querySelector('[data-grade-settings-status]');
    if (!form || !settings || !courseId) return;
    const creditInput = form.querySelector('[data-course-credit-hours]');
    const creditHours = parseCreditHours(creditInput?.value);
    if (creditHours === null || !/^\d+(?:\.\d{1,2})?$/.test(String(creditInput?.value || '').trim())) {
        setStatus(status, 'Enter credit hours greater than 0 and no more than 100, with up to two decimal places.', true);
        creditInput?.focus();
        return;
    }

    const rows = Array.from(form.querySelectorAll('[data-grade-category-row]'));
    const categories = [];
    const seenNames = new Set();
    for (const row of rows) {
        const nameInput = row.querySelector('[data-category-name]');
        const weightInput = row.querySelector('[data-category-weight]');
        const name = String(nameInput?.value || '').trim();
        const rawWeight = String(weightInput?.value || '').trim();
        if (!name && !rawWeight) continue;
        if (!name || !rawWeight) {
            setStatus(status, 'Give each category a name and weight, or remove the empty row.', true);
            (name ? weightInput : nameInput)?.focus();
            return;
        }
        const weight = Number(rawWeight);
        if (name.length > 40 || !Number.isFinite(weight) || weight < 0 || weight > 100) {
            setStatus(status, 'Category names must be 1–40 characters and weights must be between 0 and 100.', true);
            return;
        }
        const normalizedName = name.toLocaleLowerCase();
        if (seenNames.has(normalizedName)) {
            setStatus(status, 'Category names must be unique within a course.', true);
            nameInput?.focus();
            return;
        }
        seenNames.add(normalizedName);
        categories.push({ id: row.dataset.categoryId || createGradeCategoryId(), name, weight });
    }
    if (categories.length === 0) {
        setStatus(status, 'Add at least one grade category.', true);
        return;
    }
    if (categories.length > MAX_GRADE_CATEGORIES) {
        setStatus(status, `A course can have up to ${MAX_GRADE_CATEGORIES} categories.`, true);
        return;
    }
    const totalWeight = categories.reduce((total, category) => total + category.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
        setStatus(status, `Category weights currently total ${totalWeight.toFixed(1)}%. Adjust them to total 100%.`, true);
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setStatus(status, 'Saving…');
    try {
        const { error } = await supabaseClient.from('courses')
            .update({ grade_categories: categories, credit_hours: creditHours })
            .eq('id', courseId);
        if (error) throw error;
        const courseCard = Array.from(document.querySelectorAll('[data-grade-course]'))
            .find((card) => card.dataset.gradeCourse === courseId);
        if (courseCard) {
            courseCard.dataset.gradeCategories = JSON.stringify(categories);
            courseCard.dataset.creditHours = String(creditHours);
            const summary = form.querySelector('[data-grade-settings-summary]');
            if (summary) summary.textContent = `${categories.length} categories · ${creditHours} credits`;
            courseCard.querySelectorAll('[data-grade-category]').forEach((select) => {
                const selectedId = categories.some((category) => category.id === select.value) ? select.value : categories[0].id;
                select.innerHTML = renderGradeCategoryOptions(categories, selectedId);
                select.value = selectedId;
                select.dataset.savedCategory = selectedId;
            });
            const targetCategorySelect = courseCard.querySelector('[data-target-category]');
            if (targetCategorySelect) {
                const selectedId = categories.some((category) => category.id === targetCategorySelect.value)
                    ? targetCategorySelect.value
                    : categories[0].id;
                targetCategorySelect.innerHTML = renderGradeCategoryOptions(categories, selectedId);
                targetCategorySelect.value = selectedId;
            }
            let savedCategoryIndex = 0;
            form.querySelectorAll('[data-grade-category-row]').forEach((row) => {
                if (String(row.querySelector('[data-category-name]')?.value || '').trim() && categories[savedCategoryIndex]) {
                    row.dataset.categoryId = categories[savedCategoryIndex].id;
                    savedCategoryIndex += 1;
                }
            });
            updateGradeSummaries();
        }
        setStatus(status, 'Saved.');
    } catch (error) {
        setStatus(status, `Could not save grade settings: ${error?.message || 'Please try again.'}`, true);
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

export function calculateTargetScore(event) {
    event?.preventDefault?.();
    const form = event?.currentTarget;
    const courseCard = form?.closest('[data-grade-course]');
    const resultElement = form?.querySelector('[data-target-score-result]');
    const targetPercent = parsePercent(form?.querySelector('[data-target-percent]')?.value);
    const categoryId = form?.querySelector('[data-target-category]')?.value;
    if (!form || !courseCard || !resultElement) return;
    const result = calculateRequiredAssessmentScore({
        assignments: getAssignmentsFromCard(courseCard),
        course: { grade_categories: getCourseCategoriesFromCard(courseCard) },
        targetPercent,
        categoryId
    });
    const messages = {
        'invalid-target': 'Enter a target from 0% to 100%.',
        'invalid-category': 'Choose a grade category.',
        'zero-weight': 'This category has 0% weight. Increase its weight before calculating a score.',
        'no-active-weight': 'No weighted categories are available for this calculation.',
        'no-data': 'The score could not be calculated from the current grade data.'
    };
    if (messages[result.status]) {
        resultElement.textContent = messages[result.status];
        return;
    }
    if (result.status === 'already-met') {
        resultElement.textContent = `Your current grades meet this target; 0% or higher on the next ${result.categoryName} item keeps you at or above it.`;
        return;
    }
    if (result.status === 'unreachable') {
        resultElement.textContent = `You would need ${result.required.toFixed(1)}% on the next ${result.categoryName} item, which is above 100%. This target is not reachable with one more item.`;
        return;
    }
    resultElement.textContent = `You need at least ${result.required.toFixed(1)}% on the next ${result.categoryName} item to reach ${targetPercent.toFixed(1)}%.`;
}

export async function updateAssignmentGrade(assignId, gradeVal, input) {
    const value = gradeVal === '' ? null : parsePercent(gradeVal);
    if (gradeVal !== '' && value === null) {
        input?.setCustomValidity?.('Enter a grade from 0 to 100.');
        input?.reportValidity?.();
        return;
    }
    input?.setCustomValidity?.('');
    const savedGrade = input?.dataset?.savedGrade ?? loadedAssignments.find((assignment) => String(assignment.id) === String(assignId))?.grade ?? '';
    try {
        const { error } = await supabaseClient.from('assignments').update({ grade: value }).eq('id', assignId);
        if (error) throw error;
        if (input?.dataset) input.dataset.savedGrade = value === null ? '' : String(value);
        loadedAssignments = loadedAssignments.map((assignment) => String(assignment.id) === String(assignId)
            ? { ...assignment, grade: value }
            : assignment);
        updateGradeSummaries();
        setCourseStatusFromControl(input, 'Grade saved.');
    } catch (error) {
        if (input) input.value = savedGrade === null ? '' : String(savedGrade);
        if (input?.dataset) input.dataset.savedGrade = savedGrade === null ? '' : String(savedGrade);
        updateGradeSummaries();
        setCourseStatusFromControl(input, `Could not save grade: ${error?.message || 'Please try again.'}`, true);
    }
}

export async function toggleExcludeGpa(assignId, excluded, input) {
    try {
        const { error } = await supabaseClient.from('assignments').update({ exclude_from_gpa: excluded }).eq('id', assignId);
        if (error) throw error;
        if (input) input.dataset.savedExcluded = excluded ? 'true' : 'false';
        updateGradeSummaries();
        setCourseStatusFromControl(input, excluded ? 'Coursework excluded from GPA.' : 'Coursework included in GPA.');
    } catch (error) {
        if (input) input.checked = input.dataset.savedExcluded === 'true';
        setCourseStatusFromControl(input, `Could not save the GPA setting: ${error?.message || 'Please try again.'}`, true);
    }
}

export async function updateAssignmentGradeCategory(select) {
    const previousCategory = select?.dataset.savedCategory || '';
    const categoryId = select?.value || '';
    const assignmentId = select?.dataset.assignmentId;
    if (!select || !assignmentId) return;
    try {
        const { error } = await supabaseClient.from('assignments')
            .update({ grade_category_id: categoryId })
            .eq('id', assignmentId);
        if (error) throw error;
        select.dataset.savedCategory = categoryId;
        const courseCard = select.closest('[data-grade-course]');
        const courseId = courseCard?.dataset.gradeCourse;
        loadedAssignments = loadedAssignments.map((item) => item.id === assignmentId ? { ...item, grade_category_id: categoryId } : item);
        const settings = courseCard?.querySelector('[data-grade-settings]');
        settings?.querySelectorAll('[data-grade-category-row]').forEach((row) => {
            const rowCategoryId = row.dataset.categoryId;
            const removeButton = row.querySelector('button');
            if (!removeButton) return;
            const rowCategory = getCourseCategoriesFromCard(courseCard).find((item) => item.id === rowCategoryId);
            const categoryCount = loadedAssignments.filter((item) => item.course_id === courseId && item.grade_category_id === rowCategoryId).length;
            removeButton.disabled = categoryCount > 0;
            removeButton.title = categoryCount > 0 ? 'Reassign coursework in this category before removing it.' : `Remove ${rowCategory?.name || 'category'}`;
            const countMessage = row.querySelector('span');
            if (categoryCount > 0 && !countMessage) {
                row.insertAdjacentHTML('beforeend', `<span class="col-span-3 text-[11px] text-zinc-500 dark:text-zinc-400">${categoryCount} coursework item${categoryCount === 1 ? '' : 's'} assigned; reassign them first.</span>`);
            } else if (categoryCount === 0) {
                countMessage?.remove();
            }
        });
        updateGradeSummaries();
        setCourseStatusFromControl(select, 'Grade category saved.');
    } catch (error) {
        select.value = previousCategory;
        setCourseStatusFromControl(select, `Could not save the grade category: ${error?.message || 'Please try again.'}`, true);
    }
}

export function isGradebookAssignment(assignment) {
    if (assignment?.is_gradeable === true) return true;
    if (assignment?.is_gradeable === false) return false;

    // Rows cached before the gradeability field was introduced remain visible
    // only when the student had already saved gradebook data for the item.
    return parsePercent(assignment?.grade) !== null || Boolean(assignment?.grade_category_id);
}

export function filterGradePageData(courses = [], assignments = [], hideCompletedCourses = false) {
    const visibleCourses = (Array.isArray(courses) ? courses : [])
        .filter((course) => !hideCompletedCourses || course?.is_completed !== true);
    const visibleCourseIds = new Set(visibleCourses
        .map((course) => course?.id)
        .filter((courseId) => courseId !== null && courseId !== undefined && String(courseId) !== '')
        .map(String));
    const visibleAssignments = (Array.isArray(assignments) ? assignments : [])
        .filter((assignment) => assignment?.course_id !== null
            && assignment?.course_id !== undefined
            && visibleCourseIds.has(String(assignment.course_id))
            && isGradebookAssignment(assignment));

    return { courses: visibleCourses, assignments: visibleAssignments };
}

function getStudyHistoryForTermInsights() {
    try {
        return isStudyCalibrationEnabled() ? getStudyCalibrationHistory() : null;
    } catch {
        return null;
    }
}

function renderTermInsights(assignments) {
    const insights = calculateTermInsights({ assignments, studyHistory: getStudyHistoryForTermInsights() });
    const trend = insights.gradeTrend;
    const gradeSummary = trend.status === 'ready'
        ? `<p class="mt-2 text-sm text-zinc-700 dark:text-zinc-200">Earlier due-date scores averaged <strong>${trend.earlierAverage.toFixed(1)}%</strong> across ${trend.earlierCount} items; later due-date scores averaged <strong>${trend.laterAverage.toFixed(1)}%</strong> across ${trend.laterCount}. Difference: <strong>${trend.change > 0 ? '+' : ''}${trend.change.toFixed(1)} percentage points</strong>.</p>`
        : `<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-300">${trend.gradedItemCount === 0
            ? 'No graded coursework with a due date in the last 90 days.'
            : `Add ${Math.max(0, trend.minimumItems - trend.gradedItemCount)} more graded coursework item${trend.minimumItems - trend.gradedItemCount === 1 ? '' : 's'} with due dates in the last 90 days to show an early and later comparison.`}</p>`;
    const focus = insights.focus;
    let focusSummary;
    if (focus.status === 'disabled') {
        focusSummary = '<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Study-history insights are off. This section uses focus history only when you have chosen to save it.</p>';
    } else if (focus.status === 'insufficient') {
        focusSummary = `<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-300">${focus.sessionCount === 0
            ? 'No completed focus sessions are saved for the last 90 days.'
            : `Saved ${focus.sessionCount} focus session${focus.sessionCount === 1 ? '' : 's'} across ${focus.activeDayCount} day${focus.activeDayCount === 1 ? '' : 's'}. A summary appears after 3 sessions across 2 different days.`}</p>`;
    } else {
        const weekdaySummary = focus.mostActiveWeekday ? ` Most sessions were logged on ${focus.mostActiveWeekday}.` : '';
        focusSummary = `<p class="mt-2 text-sm text-zinc-700 dark:text-zinc-200">${focus.sessionCount} completed focus sessions across ${focus.activeDayCount} days, totaling ${Math.round(focus.totalMinutes)} minutes (about ${Math.round(focus.averageMinutes)} minutes per session).${weekdaySummary}</p>`;
    }

    return `
        <section aria-labelledby="termInsightsTitle" class="mb-6 border-y border-zinc-200 py-5 dark:border-brand-700">
            <div class="mb-4">
                <h3 id="termInsightsTitle" class="text-base font-bold text-zinc-900 dark:text-white">Term insights · last 90 days</h3>
                <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-300">A rolling snapshot from saved grade and focus records.</p>
            </div>
            <div class="grid gap-5 md:grid-cols-2">
                <section aria-labelledby="gradeTrendTitle">
                    <h4 id="gradeTrendTitle" class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Scores by due date</h4>
                    ${gradeSummary}
                    <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Requires 6 graded items. Each item counts equally; current saved scores are grouped by due date, so this is not a score-change history.</p>
                </section>
                <section aria-labelledby="focusPatternTitle">
                    <h4 id="focusPatternTitle" class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Focus pattern</h4>
                    ${focusSummary}
                    <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Requires 3 saved focus sessions across at least 2 days. Study activity is summarized separately from grades and does not show cause or effect.</p>
                </section>
            </div>
        </section>`;
}

export async function loadGradesPage(isFastRecalc = false) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('gradesContainer');
    if (!container) return;
    if (isFastRecalc) {
        recalculateGradeSimulatorDisplay();
        return;
    }

    let courses;
    let assignments;
    try {
        const [coursesResult, assignmentsResult] = await Promise.all([
            supabaseClient.from('courses').select('*'),
            supabaseClient.from('assignments').select('*')
        ]);
        if (coursesResult.error || assignmentsResult.error || !Array.isArray(coursesResult.data) || !Array.isArray(assignmentsResult.data)) {
            throw coursesResult.error || assignmentsResult.error || new Error('Grade data is unavailable.');
        }
        courses = coursesResult.data;
        assignments = assignmentsResult.data;
    } catch {
        container.innerHTML = `
            <section class="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-900/70 dark:bg-amber-950/30" role="alert">
                <h3 class="font-bold text-zinc-900 dark:text-white">Grades could not load</h3>
                <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Check your connection and try again. Your saved grades have not been changed.</p>
                <button type="button" onclick="loadGradesPage()" class="mt-4 min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white">Try again</button>
            </section>
        `;
        return;
    }
    loadedAssignments = assignments;
    const hideCompletedCourses = typeof localStorage !== 'undefined'
        && localStorage.getItem('duevinci_hide_completed_courses') === 'true';
    const gradePageData = filterGradePageData(courses, assignments, hideCompletedCourses);
    const visibleCourses = gradePageData.courses;
    const gradeableAssignments = gradePageData.assignments;

    const simBanner = `
        <section class="mb-6 border-b border-zinc-200 pb-5 dark:border-brand-700">
            <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h3 class="font-bold text-base text-zinc-900 dark:text-white">What-If simulator</h3>
                    <p class="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
                        ${isSimulatingGrades ? 'Change scores below to see a temporary projection. Simulated values are not saved.' : 'Try hypothetical scores without changing saved grades.'}
                    </p>
                </div>
                <div class="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                    ${isSimulatingGrades ? '<button type="button" onclick="resetGradeSimulation()" class="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-brand-600 dark:text-zinc-200 dark:hover:bg-brand-700">Reset simulation</button>' : ''}
                    <button type="button" onclick="toggleGradeSimulator()" class="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
                        ${isSimulatingGrades ? 'Exit simulator' : 'Start simulator'}
                    </button>
                </div>
            </div>
        </section>`;

    const courseCards = visibleCourses.map((course) => {
        const cAssignments = gradeableAssignments.filter((assignment) => String(assignment.course_id) === String(course.id));
        const categories = getGradeCategories(course);
        const groupedAssignments = new Map();
        for (const assignment of cAssignments) {
            const unitKey = assignment.unit_number === null || assignment.unit_number === undefined || assignment.unit_number === ''
                ? 'Coursework'
                : String(assignment.unit_number);
            if (!groupedAssignments.has(unitKey)) groupedAssignments.set(unitKey, []);
            groupedAssignments.get(unitKey).push(assignment);
        }
        const sortedUnits = Array.from(groupedAssignments.keys()).sort((a, b) => {
            if (a === 'Coursework') return 1;
            if (b === 'Coursework') return -1;
            return Number(a) - Number(b);
        });
        const unitsHtml = sortedUnits.map((unitKey) => {
            const unitAssignments = groupedAssignments.get(unitKey).slice().sort((a, b) => {
                const lessonNumber = (item) => {
                    const match = String(item.title || '').match(/lesson\s*([0-9]+)/i);
                    if (match) return parseInt(match[1], 10);
                    const digits = String(item.title || '').replace(/[^0-9]/g, '');
                    return digits ? parseInt(digits, 10) : 999;
                };
                const aIsSubItem = String(a.title || '').startsWith('↳');
                const bIsSubItem = String(b.title || '').startsWith('↳');
                if (aIsSubItem !== bIsSubItem) return aIsSubItem ? 1 : -1;
                if (aIsSubItem && bIsSubItem) return lessonNumber(a) - lessonNumber(b);
                return new Date(a.due_date || 0) - new Date(b.due_date || 0);
            });
            const rows = unitAssignments.map((item) => {
                const hasSimulated = Object.prototype.hasOwnProperty.call(simulatedGradesMap, item.id);
                const activeGrade = isSimulatingGrades && hasSimulated ? simulatedGradesMap[item.id] : item.grade;
                const isSimulatedVal = isSimulatingGrades && hasSimulated;
                return `
                    <div data-grade-row class="flex flex-col justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-brand-700 dark:bg-brand-900 sm:flex-row sm:items-center">
                        <span class="min-w-0 flex-1 truncate font-semibold ${isSimulatedVal ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-800 dark:text-zinc-100'}">${escapeHtml(item.title || 'Coursework')}</span>
                        <div class="flex flex-wrap items-center justify-end gap-2">
                            ${renderGradeControlInputs({ item, course, categories, activeGrade, isSimulatingGrades, isSimulatedVal })}
                        </div>
                    </div>`;
            }).join('');
            return `
                <section class="mb-4">
                    <h5 class="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">${unitKey === 'Coursework' ? 'Coursework' : `Unit ${escapeHtml(unitKey)}`}</h5>
                    <div class="space-y-2">${rows}</div>
                </section>`;
        }).join('');

        const average = calculateCourseAverage(cAssignments.map((assignment) => {
            const hasSimulated = Object.prototype.hasOwnProperty.call(simulatedGradesMap, assignment.id);
            return {
                ...assignment,
                grade: isSimulatingGrades && hasSimulated ? simulatedGradesMap[assignment.id] : assignment.grade
            };
        }), course);
        const averageLabel = average === null ? 'N/A' : `${average.toFixed(1)}%`;
        const courseAssignments = assignments.filter((assignment) => String(assignment.course_id) === String(course.id));
        return `
            <article data-grade-course="${escapeHtml(course.id)}" data-grade-categories="${escapeHtml(JSON.stringify(categories))}" data-credit-hours="${escapeHtml(getCourseCreditHours(course))}" class="mb-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-800">
                <header class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-brand-700">
                    <div class="flex min-w-0 items-center gap-3">
                        <span class="text-2xl" aria-hidden="true">${escapeHtml(course.emoji || '📚')}</span>
                        <h3 class="truncate font-bold text-base text-zinc-900 dark:text-zinc-100">${escapeHtml(course.code || course.name || 'Course')}</h3>
                    </div>
                    <span data-course-average class="text-sm font-extrabold text-zinc-800 dark:text-zinc-100">Course Average: ${averageLabel}</span>
                </header>
                <p data-grade-course-status aria-live="polite" class="mt-2 text-xs text-zinc-500 dark:text-zinc-400"></p>
                <div class="mt-4">
                    ${unitsHtml || '<p class="text-sm text-zinc-500 dark:text-zinc-400">No gradeable coursework in this class yet.</p>'}
                </div>
                ${renderTargetScoreCalculator(course, categories)}
                ${renderGradeSettings(course, courseAssignments)}
            </article>`;
    }).join('');

    container.innerHTML = simBanner + renderTermInsights(gradeableAssignments) + (courseCards || '<p class="text-sm text-zinc-500 dark:text-zinc-400">Add a course to start tracking grades.</p>');
    updateGradeSummaries();
}

if (typeof window !== 'undefined') {
    window.toggleGradeSimulator = toggleGradeSimulator;
    window.resetGradeSimulation = resetGradeSimulation;
    window.simulateAssignmentGrade = simulateAssignmentGrade;
    window.loadGradesPage = loadGradesPage;
    window.updateAssignmentGrade = updateAssignmentGrade;
    window.toggleExcludeGpa = toggleExcludeGpa;
    window.updateAssignmentGradeCategory = updateAssignmentGradeCategory;
    window.addGradeCategory = addGradeCategory;
    window.removeGradeCategoryRow = removeGradeCategoryRow;
    window.saveCourseGradeSettings = saveCourseGradeSettings;
    window.calculateTargetScore = calculateTargetScore;
}
