import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));

vi.mock('../js/modules/config.js', () => ({
    supabaseClient: {
        storage: { from: () => ({ createSignedUrl: supabaseMocks.createSignedUrl }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    },
}));

import { activateProfileEasterEgg, clearCachedProfileAvatarUrl, getProfileEasterEgg, invalidateProfileAvatarRequests, refreshProfileAvatar } from '../js/modules/profileAvatar.js';

const user = { id: 'easter-egg-test-user' };
const preferenceKey = `duevinci_profile_easter_egg:${user.id}`;
const localValues = new Map();
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key) => localValues.get(key) || null,
        setItem: (key, value) => localValues.set(key, String(value)),
        removeItem: (key) => localValues.delete(key),
    },
});

afterAll(() => {
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    else delete globalThis.localStorage;
});

afterEach(() => {
    invalidateProfileAvatarRequests();
    localStorage.removeItem(preferenceKey);
    if (typeof document !== 'undefined' && document.body) document.body.innerHTML = '';
    supabaseMocks.createSignedUrl.mockReset();
});

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

    it('reuses the signed avatar URL across same-tab page loads', async () => {
        const sessionValues = new Map();
        const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
        const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
        Object.defineProperty(globalThis, 'sessionStorage', {
            configurable: true,
            value: {
                getItem: (key) => sessionValues.get(key) || null,
                setItem: (key, value) => sessionValues.set(key, value),
                removeItem: (key) => sessionValues.delete(key),
            },
        });
        supabaseMocks.createSignedUrl.mockResolvedValue({
            data: { signedUrl: 'https://storage.example/avatar?token=signed' },
            error: null,
        });
        const createAvatarElements = () => {
            const image = {
                src: '',
                complete: false,
                naturalWidth: 0,
                parentElement: null,
                classList: { add: () => {}, remove: () => {} },
                getAttribute(name) { return name === 'src' ? this.src || null : null; },
                removeAttribute(name) { if (name === 'src') this.src = ''; },
            };
            const initials = { textContent: 'DV', classList: { add: () => {}, remove: () => {} } };
            const elements = { profileAvatarImage: image, profileAvatarInitials: initials };
            Object.defineProperty(globalThis, 'document', {
                configurable: true,
                value: { getElementById: (id) => elements[id] || null },
            });
            return image;
        };

        try {
            const firstImage = createAvatarElements();
            await refreshProfileAvatar(user);
            const firstUrl = firstImage.src;

            const secondImage = createAvatarElements();
            await refreshProfileAvatar(user);
            const secondUrl = secondImage.src;

            expect(secondUrl).toBe(firstUrl);
            expect(supabaseMocks.createSignedUrl).toHaveBeenCalledTimes(1);

            clearCachedProfileAvatarUrl(user);
            const thirdImage = createAvatarElements();
            await refreshProfileAvatar(user);
            expect(thirdImage.src).not.toBe('');
            expect(supabaseMocks.createSignedUrl).toHaveBeenCalledTimes(2);
        } finally {
            if (originalSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
            else delete globalThis.sessionStorage;
            if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
            else delete globalThis.document;
        }
    });

    it('does not apply or cache a signed URL after a newer account refresh starts', async () => {
        const userA = { id: 'previous-account' };
        const userB = { id: 'current-account' };
        const sessionValues = new Map();
        const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
        const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
        Object.defineProperty(globalThis, 'sessionStorage', {
            configurable: true,
            value: {
                getItem: (key) => sessionValues.get(key) || null,
                setItem: (key, value) => sessionValues.set(key, value),
                removeItem: (key) => sessionValues.delete(key),
            },
        });

        const image = {
            src: '', complete: false, naturalWidth: 0,
            classList: { add: () => {}, remove: () => {} },
            getAttribute(name) { return name === 'src' ? this.src || null : null; },
            removeAttribute(name) { if (name === 'src') this.src = ''; },
        };
        const initials = { textContent: 'DV', classList: { add: () => {}, remove: () => {} } };
        const elements = { profileAvatarImage: image, profileAvatarInitials: initials };
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: { getElementById: (id) => elements[id] || null },
        });

        let resolveOldRequest;
        let markOldRequestStarted;
        const oldRequest = new Promise((resolve) => { resolveOldRequest = resolve; });
        const oldRequestStarted = new Promise((resolve) => { markOldRequestStarted = resolve; });
        supabaseMocks.createSignedUrl
            .mockImplementationOnce(() => {
                markOldRequestStarted();
                return oldRequest;
            })
            .mockResolvedValueOnce({
                data: { signedUrl: 'https://storage.example/current-account/avatar?token=current' },
                error: null,
            });

        try {
            const previousRefresh = refreshProfileAvatar(userA);
            await oldRequestStarted;
            invalidateProfileAvatarRequests();
            await expect(refreshProfileAvatar(userB)).resolves.toBe(true);

            resolveOldRequest({
                data: { signedUrl: 'https://storage.example/previous-account/avatar?token=stale' },
                error: null,
            });
            await expect(previousRefresh).resolves.toBe(false);

            expect(image.src).toContain('/current-account/avatar');
            expect(sessionValues.has('duevinci_profile_avatar_url:current-account')).toBe(true);
            expect(sessionValues.has('duevinci_profile_avatar_url:previous-account')).toBe(false);
        } finally {
            if (originalSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
            else delete globalThis.sessionStorage;
            if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
            else delete globalThis.document;
        }
    });
});
