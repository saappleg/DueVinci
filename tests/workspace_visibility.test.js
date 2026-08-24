import { beforeEach, describe, expect, it } from 'vitest';
import { isWorkspaceFeatureVisible } from '../js/modules/ui.js';

describe('Workspace visibility preferences', () => {
    beforeEach(() => localStorage.clear());

    it('shows optional workspace areas by default and honors a hidden preference', () => {
        expect(isWorkspaceFeatureVisible('tutor')).toBe(true);
        localStorage.setItem('duevinci_workspace_tutor', 'hidden');
        expect(isWorkspaceFeatureVisible('tutor')).toBe(false);
    });

    it('keeps unknown workspace areas visible', () => {
        expect(isWorkspaceFeatureVisible('courses')).toBe(true);
    });
});
