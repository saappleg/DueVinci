import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAppRouteName, pinAppScreenToViewport, resolveAppRouteHref, resolveSameOriginAssetUrl } from '../js/modules/navigation.js';


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

    it.each(['NAV_ACTIVE_STYLE', 'NAV_INACTIVE_STYLE'])('keeps %s links at least 44px tall', (name) => {
        const classes = sidebarSource.match(new RegExp(`const ${name} = "([^"]*)"`))[1].split(/\s+/);
        expect(classes).toEqual(expect.arrayContaining(['min-h-[44px]', 'w-full']));
    });

    it('marks sidebar routes so navigation can preserve the app shell', () => {
        expect(sidebarSource).toContain('data-app-nav');
        expect(sidebarSource).toContain('data-sidebar-route="nursing"');
        expect(sidebarSource).toContain('syncActiveRoute()');
        expect(sidebarSource).toContain("setAttribute('aria-current', 'page')");
    });
});

describe('client-side route matching', () => {
    it('keeps the shared app shell pinned to the viewport after destination attributes are copied', () => {
        const added = [];
        pinAppScreenToViewport({ classList: { add: (...classes) => added.push(...classes) } });
        expect(added).toEqual(['fixed', 'inset-0']);
    });

    it.each([
        ['/', 'index'],
        ['/index.html', 'index'],
        ['/DueVinci-dev/', 'index'],
        ['/DueVinci-dev/index.html', 'index'],
        ['/org/project/', 'index'],
        ['/org/project/index.html', 'index'],
        ['/courses/', 'courses'],
        ['/courses/index.html', 'courses'],
        ['/DueVinci-dev/nursing/index.html', 'nursing'],
        ['/tutor/index.html', 'tutor'],
        ['/grades', 'grades'],
        ['/other/section/terms.html', null],
    ])('maps %s to %s', (pathname, route) => {
        expect(getAppRouteName(pathname)).toBe(route);
    });

    it('resolves route assets only when they stay on the current origin', () => {
        const origin = 'https://duevinci.tech';
        expect(resolveSameOriginAssetUrl('../assets/vendor/fullcalendar.js', 'https://duevinci.tech/calendar/index.html', origin))
            .toBe('https://duevinci.tech/assets/vendor/fullcalendar.js');
        expect(resolveSameOriginAssetUrl('https://attacker.example/untrusted.js', 'https://duevinci.tech/', origin)).toBeNull();
        expect(resolveSameOriginAssetUrl('javascript:alert(1)', 'https://duevinci.tech/', origin)).toBeNull();
    });

    it('keeps sidebar destinations anchored at the app root after pushState changes the URL', () => {
        expect(resolveAppRouteHref('calendar/index.html', './', 'https://duevinci.tech/index.html'))
            .toBe('https://duevinci.tech/calendar/index.html');
        expect(resolveAppRouteHref('calendar/index.html', '../', 'https://duevinci.tech/courses/index.html'))
            .toBe('https://duevinci.tech/calendar/index.html');
        expect(resolveAppRouteHref('calendar/index.html', '../', 'https://duevinci.tech/DueVinci-dev/nursing/index.html'))
            .toBe('https://duevinci.tech/DueVinci-dev/calendar/index.html');
    });

    it('loads the route module from the service-worker shell', () => {
        const navigationSource = readSource('js/modules/navigation.js');
        expect(readSource('sw.js')).toContain("'./js/modules/navigation.js'");
        expect(navigationSource).toContain("if (window.matchMedia?.('(max-width: 1023px)').matches) window.toggleSidebar?.(false)");
        expect(navigationSource).toContain('navigationController.abort()');
    });

    it('marks internal dashboard links for client-side navigation', () => {
        expect(readSource('js/modules/studyPlan.js')).toMatch(/href="courses\/index\.html" data-app-nav/);
        expect(readSource('js/modules/nursing.js')).toMatch(/href="\.\.\/index\.html" data-app-nav/);
    });

    it('routes command-palette and onboarding section jumps through the app navigator', () => {
        expect(readSource('js/app.js')).toContain('_rootScope.navigateApp = initializeClientNavigation(');
        expect(readSource('js/modules/easterEggs.js')).toContain('window.navigateApp(path)');
        expect(readSource('js/modules/tour.js')).toContain('window.navigateApp(path)');
        expect(readSource('js/modules/easterEggs.js')).not.toMatch(/action: \(\) => \{ window\.location\.href/);
        expect(readSource('js/modules/tour.js')).not.toMatch(/onboarding(?:AddClass|ImportSyllabus|Tutor).*window\.location\.href/);
    });

});
