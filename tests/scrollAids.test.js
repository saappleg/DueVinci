import { describe, expect, it } from 'vitest';
import { findModalScrollRoot } from '../js/modules/scrollAids.js';

describe('modal scroll aids', () => {
    it('finds the nested Settings scroll pane', () => {
        const settingsPane = { clientHeight: 480 };
        const shell = {
            querySelector(selector) {
                if (selector === '.settings-scroll-pane') return settingsPane;
                return null;
            }
        };

        expect(findModalScrollRoot(shell)).toBe(settingsPane);
    });

    it('falls back to a nested overflow pane in other dialogs', () => {
        const supportPane = { clientHeight: 360 };
        const shell = {
            querySelector(selector) {
                return selector === '[role="dialog"] .overflow-y-auto' ? supportPane : null;
            }
        };

        expect(findModalScrollRoot(shell)).toBe(supportPane);
        expect(findModalScrollRoot(null)).toBe(null);
    });
});
