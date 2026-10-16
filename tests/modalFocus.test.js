import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeSettingsModal, closeSupportModal, openSettingsModal } from '../js/modules/ui.js';

function makeFocusTarget(name, isConnected, getDocument) {
    return {
        name,
        isConnected,
        focus() { getDocument().activeElement = this; },
        blur() { getDocument().activeElement = getDocument().body; },
        getAttribute() { return null; },
        closest() { return null; },
        offsetParent: {},
    };
}

function installModalDocument({ withFallback = true, modalId = 'settingsModal' } = {}) {
    const documentStub = { activeElement: null, body: null };
    const classes = new Set(['hidden']);
    const closeControl = makeFocusTarget('close control', true, () => documentStub);
    const fallback = withFallback
        ? makeFocusTarget(modalId === 'settingsModal' ? 'Settings opener' : 'Support opener', true, () => documentStub)
        : null;
    documentStub.body = makeFocusTarget('body', true, () => documentStub);
    const modal = {
        id: modalId,
        dataset: {},
        attributes: {},
        hiddenAtFocus: null,
        classList: {
            contains(name) { return classes.has(name); },
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
        },
        contains(element) { return element === closeControl; },
        querySelector(selector) { return selector === '[data-modal-close]' ? closeControl : null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        setAttribute(name, value) {
            this.attributes[name] = value;
            if (name === 'aria-hidden' && value === 'true') this.hiddenAtFocus = documentStub.activeElement;
        },
    };
    documentStub.getElementById = (id) => id === modalId ? modal : null;
    const fallbackSelector = modalId === 'settingsModal'
        ? 'duevinci-sidebar button[aria-label="Open profile settings"]'
        : 'button[onclick*="openSupportModal"]';
    documentStub.querySelector = (selector) => selector === fallbackSelector ? fallback : null;
    documentStub.querySelectorAll = () => [];
    documentStub.createElement = () => ({ classList: { add() {}, remove() {} } });

    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);

    return { documentStub, modal, closeControl, fallback };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Settings modal focus on close', () => {
    it('moves focus to the external fallback before hiding when no opener was recorded', () => {
        const { documentStub, modal, closeControl, fallback } = installModalDocument();
        documentStub.activeElement = closeControl;

        closeSettingsModal();

        expect(modal.hiddenAtFocus).toBe(fallback);
        expect(documentStub.activeElement).toBe(fallback);
    });

    it('restores a connected opener before hiding', () => {
        const { documentStub, modal, closeControl } = installModalDocument();
        const opener = makeFocusTarget('original opener', true, () => documentStub);
        documentStub.activeElement = opener;

        openSettingsModal();
        documentStub.activeElement = closeControl;
        closeSettingsModal();

        expect(modal.hiddenAtFocus).toBe(opener);
        expect(documentStub.activeElement).toBe(opener);
    });

    it('uses the fallback before hiding when the original opener was disconnected', () => {
        const { documentStub, modal, closeControl, fallback } = installModalDocument();
        const opener = makeFocusTarget('original opener', true, () => documentStub);
        documentStub.activeElement = opener;

        openSettingsModal();
        expect(modal.attributes['aria-hidden']).toBe('false');
        expect(documentStub.activeElement).toBe(opener);
        opener.isConnected = false;
        documentStub.activeElement = closeControl;

        closeSettingsModal();

        expect(modal.hiddenAtFocus).toBe(fallback);
        expect(modal.attributes['aria-hidden']).toBe('true');
        expect(documentStub.activeElement).toBe(fallback);
    });

    it('uses the Support opener before hiding through the shared close path', () => {
        const { documentStub, modal, closeControl, fallback } = installModalDocument({ modalId: 'supportModal' });
        documentStub.activeElement = closeControl;

        closeSupportModal();

        expect(modal.hiddenAtFocus).toBe(fallback);
        expect(documentStub.activeElement).toBe(fallback);
    });

    it('blurs focus from the modal before hiding when no external target is available', () => {
        const { documentStub, modal, closeControl } = installModalDocument({ withFallback: false });
        documentStub.activeElement = closeControl;

        closeSettingsModal();

        expect(modal.hiddenAtFocus).toBe(documentStub.body);
        expect(documentStub.activeElement).toBe(documentStub.body);
    });
});
