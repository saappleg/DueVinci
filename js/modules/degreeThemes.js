// --- DUEVINCI DEGREE THEMES ---
export const DEGREE_THEME_STORAGE_KEY = 'duevinci_workspace_degree_theme';

export const DEGREE_THEMES = [
    { id: 'classic', label: 'DueVinci Classic' },
    { id: 'nursing', label: 'Nursing & Health Sciences' },
    { id: 'software-development', label: 'Software Development' },
    { id: 'it-development', label: 'IT Development & Cybersecurity' },
    { id: 'education-early-childhood', label: 'Early Childhood Education' },
    { id: 'education-elementary', label: 'Elementary Education' },
    { id: 'education-secondary', label: 'Secondary Education' },
    { id: 'education-special', label: 'Special Education' },
    { id: 'education-stem', label: 'STEM Education' },
    { id: 'education-higher-ed', label: 'Higher Education' },
    { id: 'sports', label: 'Sports & Athletics' }
];

export function normalizeDegreeTheme(value) {
    const normalized = String(value || '').trim();
    return DEGREE_THEMES.some((theme) => theme.id === normalized) ? normalized : 'classic';
}

export function getDegreeTheme() {
    try {
        return normalizeDegreeTheme(localStorage.getItem(DEGREE_THEME_STORAGE_KEY));
    } catch {
        return 'classic';
    }
}

export function applyDegreeTheme(themeId = getDegreeTheme()) {
    const normalized = normalizeDegreeTheme(themeId);
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-degree-theme', normalized);
    }
    return normalized;
}

export function setDegreeTheme(themeId) {
    const normalized = normalizeDegreeTheme(themeId);
    try {
        localStorage.setItem(DEGREE_THEME_STORAGE_KEY, normalized);
    } catch {
        // The selected colors still apply for this page if storage is unavailable.
    }
    if (typeof window !== 'undefined') window.syncPreferencesNow?.();
    return applyDegreeTheme(normalized);
}
