const TERM_DETAILS_KEY = 'duevinci_term_details';

function dateKey(value) {
    const valueKey = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(valueKey) ? valueKey : '';
}

export function getTermDetails() {
    if (typeof localStorage === 'undefined') return {};
    try {
        const details = JSON.parse(localStorage.getItem(TERM_DETAILS_KEY) || '{}');
        return details && typeof details === 'object' && !Array.isArray(details) ? details : {};
    } catch {
        return {};
    }
}

export function getTermDateRange(termName, details = getTermDetails()) {
    const value = details[String(termName || '').trim()] || {};
    return { start_date: dateKey(value.start_date), end_date: dateKey(value.end_date) };
}

export function saveTermDateRange(termName, startDate, endDate) {
    const name = String(termName || '').trim();
    if (!name || name === 'Unassigned' || typeof localStorage === 'undefined') return false;
    const details = getTermDetails();
    const start = dateKey(startDate);
    const end = dateKey(endDate);
    if (!start && !end) delete details[name];
    else details[name] = { start_date: start || null, end_date: end || null };
    localStorage.setItem(TERM_DETAILS_KEY, JSON.stringify(details));
    return true;
}

export function getCourseDateBounds(course, details = getTermDetails()) {
    const termRange = getTermDateRange(course?.term, details);
    const courseStart = dateKey(course?.start_date);
    const courseEnd = dateKey(course?.end_date);
    const starts = [courseStart, termRange.start_date].filter(Boolean).sort();
    const ends = [courseEnd, termRange.end_date].filter(Boolean).sort();
    const startDate = starts.at(-1) || '';
    const endDate = ends[0] || '';
    return { startDate, endDate, isValid: !(startDate && endDate && startDate > endDate) };
}

export function clampDateToCourseWindow(value, course, details = getTermDetails()) {
    const valueKey = dateKey(value);
    if (!valueKey) return value;
    const { startDate, endDate, isValid } = getCourseDateBounds(course, details);
    if (!isValid) return valueKey;
    if (startDate && valueKey < startDate) return startDate;
    if (endDate && valueKey > endDate) return endDate;
    return valueKey;
}

export function isDateWithinCourseWindow(value, course, details = getTermDetails()) {
    const valueKey = dateKey(value);
    if (!valueKey) return true;
    const { startDate, endDate, isValid } = getCourseDateBounds(course, details);
    if (!isValid) return false;
    return (!startDate || valueKey >= startDate) && (!endDate || valueKey <= endDate);
}

export function isWeeklyPacedCourse(course) {
    return course?.pacing_type === 'weekly'
        || course?.lms_provider === 'browser_wgu'
        || course?.lms_provider === 'browser_maestro';
}

export function getArchivedTermNames(termNames, today = new Date()) {
    const todayKey = dateKey(today instanceof Date ? [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-') : today);
    const details = getTermDetails();
    return new Set((termNames || []).filter((name) => {
        const endDate = getTermDateRange(name, details).end_date;
        return endDate && todayKey && endDate < todayKey;
    }));
}
