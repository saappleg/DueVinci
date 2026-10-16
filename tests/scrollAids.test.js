import { describe, expect, it } from 'vitest';
import { findForegroundModalScrollRoot, findForegroundModalShell, findModalScrollRoot, shouldShowScrollProgress } from '../js/modules/scrollAids.js';

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

    it('finds the scroll pane inside a dialog root', () => {
        const planPane = { clientHeight: 300 };
        const shell = {
            matches: (selector) => selector === '[role="dialog"]',
            querySelector(selector) {
                return selector === '.overflow-y-auto' ? planPane : null;
            }
        };

        expect(findModalScrollRoot(shell)).toBe(planPane);
    });

    it('prefers a visible nested dialog over its background Settings pane', () => {
        const settingsPane = { clientHeight: 480 };
        const courseList = { clientHeight: 300 };
        const settingsDialog = {
            closest: () => null,
            getAttribute: () => null,
            querySelector(selector) {
                return selector === '.settings-scroll-pane' ? settingsPane : null;
            }
        };
        const canvasDialog = {
            closest: () => null,
            getAttribute: () => null,
            matches: (selector) => selector === '[role="dialog"]',
            querySelector(selector) {
                return selector === '.overflow-y-auto' ? courseList : null;
            }
        };

        expect(findForegroundModalScrollRoot([settingsDialog, canvasDialog])).toBe(courseList);
    });

    it('does not fall back to the background pane when the foreground dialog has no scroll pane', () => {
        const settingsPane = { clientHeight: 480 };
        const backgroundDialog = {
            closest: () => null,
            getAttribute: () => null,
            querySelector(selector) {
                return selector === '.settings-scroll-pane' ? settingsPane : null;
            }
        };
        const foregroundDialog = {
            closest: () => null,
            getAttribute: () => null,
            matches: (selector) => selector === '[role="dialog"]',
            querySelector: () => null
        };
        const shells = [backgroundDialog, foregroundDialog];

        expect(findForegroundModalShell(shells)).toBe(foregroundDialog);
        expect(findForegroundModalScrollRoot(shells)).toBeNull();
    });

    it('hides page progress behind a modal without a scroll pane or overflow', () => {
        expect(shouldShowScrollProgress({
            hasModal: true,
            modalRoot: null,
            appVisible: true,
            scrollHeight: 1200,
            clientHeight: 600
        })).toBe(false);
        expect(shouldShowScrollProgress({
            hasModal: true,
            modalRoot: {},
            appVisible: true,
            scrollHeight: 600,
            clientHeight: 600
        })).toBe(false);
        expect(shouldShowScrollProgress({
            hasModal: true,
            modalRoot: {},
            appVisible: true,
            scrollHeight: 900,
            clientHeight: 600
        })).toBe(true);
    });
});
