import { describe, expect, it } from 'vitest';
import { DEGREE_THEMES, DEGREE_THEME_STORAGE_KEY, normalizeDegreeTheme } from '../js/modules/degreeThemes.js';
import { readFileSync } from 'node:fs';

const degreeThemeCss = readFileSync(new URL('../assets/css/degree-theme.css', import.meta.url), 'utf8');

function getThemeColor(themeId, variable) {
    const rule = degreeThemeCss.match(new RegExp(`html\\[data-degree-theme="${themeId}"\\]\\s*\\{([^}]*)\\}`));
    const color = rule?.[1].match(new RegExp(`--dv-degree-${variable}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
    if (!color) throw new Error(`Missing ${variable} color for ${themeId}`);
    return color;
}

function contrastRatio(first, second) {
    const luminance = (color) => {
        const channels = color.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
        const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

function blendColor(foreground, background, opacity) {
    const foregroundChannels = foreground.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
    const backgroundChannels = background.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
    const channels = foregroundChannels.map((value, index) =>
        Math.round(value * opacity + backgroundChannels[index] * (1 - opacity))
    );
    return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

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
    it('keeps themed text readable and provides light and dark subject artwork', () => {
        const themes = DEGREE_THEMES.filter((theme) => theme.id !== 'classic');
        for (const theme of themes) {
            const accent = getThemeColor(theme.id, 'accent');
            const strong = getThemeColor(theme.id, 'strong');
            const soft = getThemeColor(theme.id, 'soft');
            const light = getThemeColor(theme.id, 'light');
            const darkSoft = getThemeColor(theme.id, 'dark-soft');

            // Themed body text and button labels meet WCAG AA for normal text.
            expect(contrastRatio(strong, '#ffffff'), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(strong, soft), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio('#ffffff', accent), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(light, '#1c1c1c'), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(light, darkSoft), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(light, accent), theme.id).toBeGreaterThanOrEqual(4.5);
            const lightArtworkSurface = blendColor(accent, '#ffffff', 0.18);
            const lightSoftArtworkSurface = blendColor(accent, soft, 0.18);
            const darkArtworkSurface = blendColor(light, '#1c1c1c', 0.10);
            const darkSoftArtworkSurface = blendColor(light, darkSoft, 0.10);
            expect(contrastRatio('#52525b', lightArtworkSurface), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio('#52525b', lightSoftArtworkSurface), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio('#d4d4d8', darkArtworkSurface), theme.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio('#d4d4d8', darkSoftArtworkSurface), theme.id).toBeGreaterThanOrEqual(4.5);

            const artworkRule = degreeThemeCss.split('\n').find((line) =>
                line.startsWith(`html[data-degree-theme="${theme.id}"] { --dv-degree-pattern-light:`)
            );
            expect(artworkRule, theme.id).toBeTruthy();
            const artwork = [...artworkRule.matchAll(/data:image\/svg\+xml,([^"]+)/g)].map(([, source]) => decodeURIComponent(source));
            expect(artwork).toHaveLength(2);
            expect(artwork[0]).toContain(`stroke="${accent}"`);
            expect(artwork[0]).toContain('opacity=".18"');
            expect(artwork[1]).toContain(`stroke="${light}"`);
            expect(artwork[1]).toContain('opacity=".1"');
        }
        expect(degreeThemeCss).toContain('html[data-degree-theme].dark [class~="text-indigo-600"]');
    });

});
