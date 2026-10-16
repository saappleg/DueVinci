import { describe, expect, it } from 'vitest';
import { createScrollAidCandidateBounds, findForegroundModalScrollRoot, findForegroundModalShell, findModalScrollRoot, findScrollAidBottomOffset, findScrollAidLeft, setScrollAidVisibility, shouldShowScrollProgress } from '../js/modules/scrollAids.js';

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

    it('sets an explicit display override when initially hidden', () => {
        const button = { hidden: false, style: { display: '' } };

        setScrollAidVisibility(button, false);

        expect(button.hidden).toBe(true);
        expect(button.style.display).toBe('none');
    });

    it('clears the inline display override before measuring a visible button', () => {
        const button = { hidden: true, style: { display: 'none' } };

        setScrollAidVisibility(button, true);

        expect(button.hidden).toBe(false);
        expect(button.style.display).toBe('');
    });

    it('restores explicit display none when hiding after a visible update', () => {
        const button = { hidden: true, style: { display: 'none' } };
        setScrollAidVisibility(button, true);

        setScrollAidVisibility(button, false);

        expect(button.hidden).toBe(true);
        expect(button.style.display).toBe('none');
    });

    it('moves Back to top above a bottom control it would otherwise cover', () => {
        const button = { left: 330, right: 374, top: 784, bottom: 828, width: 44, height: 44 };
        const tutorSend = { left: 294.8, right: 370, top: 758, bottom: 824 };
        const adjustedBottom = findScrollAidBottomOffset({
            buttonBounds: button,
            controlBounds: [tutorSend],
            viewportHeight: 844,
            areaBounds: { top: 64, bottom: 844 },
            defaultOffset: 16,
        });

        expect(adjustedBottom).toBe(94);
        expect(844 - adjustedBottom).toBeLessThanOrEqual(tutorSend.top - 8);
    });

    it('keeps the default Back to top position when no visible control overlaps it', () => {
        const button = { left: 330, right: 374, top: 784, bottom: 828, width: 44, height: 44 };
        const tutorInput = { left: 20, right: 286.8, top: 758, bottom: 824 };

        expect(findScrollAidBottomOffset({
            buttonBounds: button,
            controlBounds: [tutorInput],
            viewportHeight: 844,
            defaultOffset: 16,
        })).toBe(16);
    });

    it('hides Back to top if moving above a control would cross the active pane header', () => {
        const button = { left: 330, right: 374, top: 784, bottom: 828, width: 44, height: 44 };
        const saveButton = { left: 300, right: 370, top: 758, bottom: 824 };

        expect(findScrollAidBottomOffset({
            buttonBounds: button,
            controlBounds: [saveButton],
            viewportHeight: 844,
            areaBounds: { top: 730, bottom: 844 },
            defaultOffset: 16,
        })).toBeNull();
    });

    it('keeps Back to top inside the active pane when its bottom is above the viewport edge', () => {
        const button = { left: 330, right: 374, top: 784, bottom: 828, width: 44, height: 44 };
        const bottom = findScrollAidBottomOffset({
            buttonBounds: button,
            controlBounds: [],
            viewportHeight: 844,
            areaBounds: { top: 64, bottom: 760 },
            defaultOffset: 16,
        });

        expect(bottom).toBe(92);
        expect(844 - bottom - button.height).toBeGreaterThanOrEqual(72);
        expect(844 - bottom).toBeLessThanOrEqual(752);
    });

    it('chooses the scroll aid x position inside a centered dialog before checking collisions', () => {
        const area = { left: 360, right: 1000 };
        const left = findScrollAidLeft(area, 1200, 44);
        const domRectLike = Object.create({
            get width() { return 44; },
            get height() { return 44; },
        });
        const button = createScrollAidCandidateBounds(domRectLike, left);
        const footerControl = { left: 950, right: 1000, top: 784, bottom: 828, width: 50, height: 44 };

        expect(left).toBe(948);
        expect(button).toEqual({ left: 948, right: 992, width: 44, height: 44 });
        expect(findScrollAidBottomOffset({
            buttonBounds: button,
            controlBounds: [footerControl],
            viewportHeight: 844,
            areaBounds: { ...area, top: 64, bottom: 844 },
            defaultOffset: 16,
        })).toBe(68);
    });
});
