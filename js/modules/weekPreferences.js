export const WEEK_START_STORAGE_KEY = 'duevinci_week_start_day';
export const DEFAULT_WEEK_START_DAY = 'monday';

export function normalizeWeekStartDay(value) {
    return value === 'sunday' || value === 'monday' ? value : DEFAULT_WEEK_START_DAY;
}

export function getWeekStartDay() {
    try {
        return normalizeWeekStartDay(localStorage.getItem(WEEK_START_STORAGE_KEY));
    } catch {
        return DEFAULT_WEEK_START_DAY;
    }
}

export function getWeekStartDayIndex(value = getWeekStartDay()) {
    return normalizeWeekStartDay(value) === 'sunday' ? 0 : 1;
}

export function setWeekStartDay(value) {
    const normalized = normalizeWeekStartDay(value);
    try {
        localStorage.setItem(WEEK_START_STORAGE_KEY, normalized);
    } catch {
        // The app still uses the selected value for this session if storage is unavailable.
    }
    return normalized;
}
