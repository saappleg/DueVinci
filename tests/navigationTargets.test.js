import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function findTagClasses(source, tag, attribute, value) {
    const openingTags = source.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) || [];
    const openingTag = openingTags.find((candidate) => candidate.includes(`${attribute}="${value}"`));
    expect(openingTag).toBeDefined();
    return openingTag.match(/class="([^"]*)"/)[1].split(/\s+/);
}

describe('navigation touch targets', () => {
    it.each([
        'index.html',
        'courses/index.html',
        'grades/index.html',
        'calendar/index.html',
        'nursing/index.html',
        'tutor/index.html',
    ])('%s keeps the sidebar toggle at least 44px in both dimensions', (path) => {
        const classes = findTagClasses(readSource(path), 'button', 'onclick', 'toggleSidebar()');
        expect(classes).toEqual(expect.arrayContaining([
            'min-h-[44px]', 'min-w-[44px]', 'shrink-0', 'items-center', 'justify-center',
        ]));
    });

    const sidebarSource = readSource('js/modules/components.js');

    it('gives the main timer toggle a descriptive accessible name', () => {
        const button = sidebarSource.match(/<button\b[^>]*id="timerPlayBtn"[^>]*>/)[0];
        expect(button).toContain('aria-label="Start or pause timer"');
    });

    it.each([
        'toggleTimerSettings()',
        'toggleTimerCollapse()',
        'resetTimer()',
        'toggleTimer()',
        'skipTimer()',
        'saveTimerSettings()',
        'openSupportModal()',
    ])('keeps the %s sidebar button at least 44px in both dimensions', (action) => {
        const classes = findTagClasses(sidebarSource, 'button', 'onclick', action);
        expect(classes).toEqual(expect.arrayContaining(['min-h-[44px]', 'min-w-[44px]']));
    });

    it.each(['focusMinInput', 'breakMinInput'])('keeps the %s sidebar field at least 44px tall', (id) => {
        const classes = findTagClasses(sidebarSource, 'input', 'id', id);
        expect(classes).toContain('min-h-[44px]');
    });

    it.each(['navActiveStyle', 'navInactiveStyle'])('keeps %s links at least 44px tall', (name) => {
        const classes = sidebarSource.match(new RegExp(`const ${name} = "([^"]*)"`))[1].split(/\s+/);
        expect(classes).toEqual(expect.arrayContaining(['min-h-[44px]', 'w-full']));
    });
});
