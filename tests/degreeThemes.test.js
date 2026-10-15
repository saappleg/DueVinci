import { describe, expect, it } from 'vitest';
import { DEGREE_THEMES, DEGREE_THEME_STORAGE_KEY, normalizeDegreeTheme } from '../js/modules/degreeThemes.js';

describe('degree themes', () => {
    it('offers the requested study fields and education paths', () => {
        const ids = DEGREE_THEMES.map((theme) => theme.id);
        expect(ids).toContain('nursing');
        expect(ids).toContain('software-development');
        expect(ids).toContain('it-development');
        expect(ids.filter((id) => id.startsWith('education-')).length).toBeGreaterThanOrEqual(5);
        expect(ids).toContain('sports');
    });

    it('uses an account-synced key and falls back to classic for unknown values', () => {
        expect(DEGREE_THEME_STORAGE_KEY).toBe('duevinci_workspace_degree_theme');
        expect(normalizeDegreeTheme('nursing')).toBe('nursing');
        expect(normalizeDegreeTheme('unknown-degree')).toBe('classic');
    });
});
