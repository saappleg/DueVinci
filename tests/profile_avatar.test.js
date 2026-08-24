import { afterEach, describe, expect, it } from 'vitest';
import { activateProfileEasterEgg, getProfileEasterEgg } from '../js/modules/profileAvatar.js';

const user = { id: 'easter-egg-test-user' };
const preferenceKey = `duevinci_profile_easter_egg:${user.id}`;

afterEach(() => localStorage.removeItem(preferenceKey));

describe('Profile Easter-egg badges', () => {
    it('keeps only the most recently activated badge for a user', () => {
        expect(activateProfileEasterEgg('maestro', user)).toBe(true);
        expect(getProfileEasterEgg(user)).toBe('maestro');

        expect(activateProfileEasterEgg('nightowl', user)).toBe(true);
        expect(getProfileEasterEgg(user)).toBe('nightowl');
    });

    it('does not activate an unknown badge', () => {
        expect(activateProfileEasterEgg('unknown', user)).toBe(false);
        expect(getProfileEasterEgg(user)).toBeNull();
    });

    it('creates and renders a badge when an older sidebar has no badge element yet', () => {
        const originalDocument = globalThis.document;
        let badge = null;
        const container = { appendChild: (element) => { badge = element; } };
        const avatar = { parentElement: container };
        globalThis.document = {
            getElementById: (id) => id === 'profileAvatarEasterEgg' ? badge : id === 'profileAvatarImage' ? avatar : null,
            createElement: () => ({
                className: '',
                classList: { add: () => {}, remove: () => {} },
                dataset: {},
                style: {},
                removeAttribute: () => {},
            }),
        };

        try {
            activateProfileEasterEgg('maestro', user);
            expect(badge).toMatchObject({ id: 'profileAvatarEasterEgg', alt: 'Maestro shield' });
            expect(badge.src).toContain('/assets/images/maestro-logo.svg');
            expect(badge.dataset.profileEasterEgg).toBe('maestro');
            expect(badge.className).toContain('bottom-0');
            expect(badge.className).not.toContain('bg-white');
            expect(badge.hidden).toBe(false);
        } finally {
            globalThis.document = originalDocument;
        }
    });
});
