import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const settingsSources = [
    ['static dashboard', new URL('../index.html', import.meta.url)],
    ['generated dashboard', new URL('../js/modules/ui.js', import.meta.url)]
].map(([name, url]) => [name, readFileSync(fileURLToPath(url), 'utf8')]);

describe('Settings modal markup', () => {
    it.each(settingsSources)('%s associates the visible Profile photo label with its file input', (_name, source) => {
        expect(source).toContain('<label for="profileAvatarInput" class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">Profile photo</label>');
    });

    it.each(settingsSources)('%s keeps the profile pane scrollable and connects form labels', (_name, source) => {
        expect(source).toContain('class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"');
        expect(source).toContain('class="settings-scroll-pane min-h-0 flex-1 overflow-y-auto overscroll-contain');
        for (const id of ['profileDisplayName', 'profileEmail', 'profilePassword', 'canvasDomainInput', 'canvasTokenInput']) {
            expect(source).toContain(`for="${id}"`);
        }
    });

    it('keeps the generated support dialog scroll pane inside its bounded flex wrapper', () => {
        const generatedMarkup = settingsSources.find(([name]) => name === 'generated dashboard')[1];
        expect(generatedMarkup).toContain('class="support-scroll-pane min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pt-16"');
        expect(generatedMarkup).toContain('class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"');
    });

    it('associates generated support form labels and identifies the email autofill field', () => {
        const generatedMarkup = settingsSources.find(([name]) => name === 'generated dashboard')[1];
        for (const id of ['supportCategory', 'supportEmail', 'supportSubject', 'supportMessageText']) {
            expect(generatedMarkup).toContain(`for="${id}"`);
        }
        expect(generatedMarkup).toContain('id="supportEmail" autocomplete="email"');
    });

    it.each(settingsSources)('%s submits Canvas and Brightspace connection forms through their existing handlers', (_name, source) => {
        const forms = [
            {
                id: 'canvasConnectorArea',
                handler: 'handleCanvasConnect',
                fields: ['canvasDomainInput', 'canvasTokenInput'],
                button: 'canvasConnectBtn',
            },
            {
                id: 'brightspaceConnectArea',
                handler: 'connectBrightspaceCalendar',
                fields: ['brightspaceFeedUrlInput'],
                button: 'brightspaceConnectButton',
            },
        ];

        for (const { id, handler, fields, button } of forms) {
            const start = source.indexOf(`<form id="${id}"`);
            expect(start).toBeGreaterThanOrEqual(0);
            const end = source.indexOf('</form>', start);
            expect(end).toBeGreaterThan(start);
            const markup = source.slice(start, end);

            expect(markup).toContain(`onsubmit="event.preventDefault(); ${handler}()`);
            for (const fieldId of fields) expect(markup).toContain(`id="${fieldId}"`);

            const connectButton = markup.match(new RegExp(`<button\\b[^>]*id="${button}"[^>]*>`))?.[0];
            expect(connectButton).toContain('type="submit"');
            expect(connectButton).not.toContain('onclick=');
        }

        expect(source).toMatch(/id="canvasTokenInput" autocomplete="off"/);
        expect(source).toMatch(/id="brightspaceFeedUrlInput" autocomplete="off"/);
    });

    it('labels generated command search and resource link inputs without adding visible text', () => {
        const commandPaletteSource = readFileSync(new URL('../js/modules/easterEggs.js', import.meta.url), 'utf8');
        const academicsSource = readFileSync(new URL('../js/modules/academics.js', import.meta.url), 'utf8');
        const coursesSource = readFileSync(new URL('../js/modules/courses.js', import.meta.url), 'utf8');

        expect(commandPaletteSource).toContain('<label for="cmdInput" class="sr-only">Search pages and actions</label>');
        expect(academicsSource).toContain('<label for="resTitle_${escapeHtml(courseId)}" class="sr-only">Resource title</label>');
        expect(academicsSource).toContain('<label for="resUrl_${escapeHtml(courseId)}" class="sr-only">Resource URL</label>');
        expect(coursesSource).toContain('<label for="resTitle_${courseIdAttr}" class="sr-only">Resource title</label>');
        expect(coursesSource).toContain('<label for="resUrl_${courseIdAttr}" class="sr-only">Resource URL</label>');
    });
});
