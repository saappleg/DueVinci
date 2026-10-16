import { describe, expect, it } from 'vitest';
import { DueVinciSidebar } from '../js/modules/components.js';
import { focusFirstSidebarElement, trapSidebarTabKey } from '../js/modules/ui.js';

function makeFocusable(name, { visible = true } = {}) {
    return {
        name,
        disabled: false,
        offsetParent: visible ? {} : null,
        focused: false,
        focus() { this.focused = true; },
        getAttribute() { return null; },
        closest(selector) { return selector === '.hidden' && !visible ? {} : null; },
    };
}

function makeSidebar(focusable) {
    return {
        querySelectorAll() { return focusable; },
        contains(element) { return focusable.includes(element); },
        focused: false,
        focus() { this.focused = true; },
    };
}

function keyEvent(key, shiftKey = false) {
    return {
        key,
        shiftKey,
        prevented: false,
        preventDefault() { this.prevented = true; },
    };
}

describe('mobile sidebar keyboard focus', () => {
    it('moves focus into the sidebar when it opens, skipping hidden items', () => {
        const hiddenTimerControl = makeFocusable('hidden timer setting', { visible: false });
        const firstLink = makeFocusable('Dashboard');
        const secondLink = makeFocusable('Classes');
        const sidebar = makeSidebar([hiddenTimerControl, firstLink, secondLink]);

        expect(focusFirstSidebarElement(sidebar)).toBe(firstLink);
        expect(firstLink.focused).toBe(true);
        expect(hiddenTimerControl.focused).toBe(false);
    });

    it('keeps Tab inside the sidebar instead of focusing dimmed page controls', () => {
        const firstLink = makeFocusable('Dashboard');
        const lastButton = makeFocusable('Support');
        const sidebar = makeSidebar([firstLink, lastButton]);
        const outsideSignOut = makeFocusable('Sign out');
        const event = keyEvent('Tab');

        expect(trapSidebarTabKey(sidebar, event, outsideSignOut)).toBe(true);
        expect(event.prevented).toBe(true);
        expect(firstLink.focused).toBe(true);
    });

    it('wraps Shift+Tab from the first item to the final sidebar control', () => {
        const firstLink = makeFocusable('Dashboard');
        const lastButton = makeFocusable('Support');
        const sidebar = makeSidebar([firstLink, lastButton]);
        const event = keyEvent('Tab', true);

        expect(trapSidebarTabKey(sidebar, event, firstLink)).toBe(true);
        expect(event.prevented).toBe(true);
        expect(lastButton.focused).toBe(true);
    });

    it('marks the translated mobile drawer inert and restores it at desktop width', () => {
        const aside = {
            inert: false,
            attributes: {},
            classList: { contains: (className) => className === '-translate-x-full' },
            setAttribute(name, value) { this.attributes[name] = value; },
        };
        const sidebar = { querySelector: () => aside };
        const originalMatchMedia = window.matchMedia;

        try {
            window.matchMedia = (query) => ({ matches: query.includes('1023px') });
            DueVinciSidebar.prototype.syncSidebarA11yState.call(sidebar);
            expect(aside.inert).toBe(true);
            expect(aside.attributes['aria-hidden']).toBe('true');

            window.matchMedia = () => ({ matches: false });
            DueVinciSidebar.prototype.syncSidebarA11yState.call(sidebar);
            expect(aside.inert).toBe(false);
            expect(aside.attributes['aria-hidden']).toBe('false');
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });
});
