import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const settingsSources = [
    ['static dashboard', new URL('../index.html', import.meta.url)],
    ['generated dashboard', new URL('../js/modules/ui.js', import.meta.url)]
].map(([name, url]) => [name, readFileSync(fileURLToPath(url), 'utf8')]);

describe('Settings modal markup', () => {
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
});
