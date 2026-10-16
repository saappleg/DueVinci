import { describe, expect, it } from 'vitest';
import { changedPreferenceKeys, isValidNursingWorkspaceShape, mergePreferenceChanges } from '../js/modules/preferenceMerge.js';

describe('cross-device preference merge', () => {
    it('keeps remote changes to untouched settings when one local setting changes', () => {
        const baseline = { theme: 'light', focusMinutes: '25' };
        const local = { theme: 'dark', focusMinutes: '25' };
        const remote = { theme: 'light', focusMinutes: '40' };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);

        expect(merged).toEqual({ theme: 'dark', focusMinutes: '40' });
    });

    it('syncs an intentional setting deletion without dropping unrelated remote values', () => {
        const baseline = { theme: 'light', duevinci_week_start_day: 'monday' };
        const local = { theme: 'light' };
        const remote = { theme: 'light', duevinci_week_start_day: 'monday', focusMinutes: '40' };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);

        expect(merged).toEqual({ theme: 'light', focusMinutes: '40' });
    });

    it('merges independent Nursing Hub records from two devices', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baseWorkspace = {
            rotations: [],
            carePlans: [{ id: 'plan-1', title: 'Baseline', scenario: 'Base case' }],
            customCards: [],
            completedSystems: [],
        };
        const localWorkspace = {
            ...baseWorkspace,
            carePlans: [baseWorkspace.carePlans[0], { id: 'plan-2', title: 'Local plan', scenario: 'Local case' }],
        };
        const remoteWorkspace = {
            ...baseWorkspace,
            customCards: [{ id: 'card-1', front: 'Remote question', back: 'Remote answer' }],
        };
        const baseline = { [key]: JSON.stringify(baseWorkspace) };
        const local = { [key]: JSON.stringify(localWorkspace) };
        const remote = { [key]: JSON.stringify(remoteWorkspace), focusMinutes: '40' };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);
        const workspace = JSON.parse(merged[key]);

        expect(workspace.carePlans.map((plan) => plan.id)).toEqual(['plan-1', 'plan-2']);
        expect(workspace.customCards.map((card) => card.id)).toEqual(['card-1']);
        expect(merged.focusMinutes).toBe('40');
    });

    it('keeps separate Nursing Hub records newly added on both devices', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const base = { carePlans: [], customCards: [] };
        const localWorkspace = { carePlans: [{ id: 'local-plan', title: 'Local note' }], customCards: [] };
        const remoteWorkspace = { carePlans: [{ id: 'remote-plan', title: 'Remote note' }], customCards: [] };
        const baseline = { [key]: JSON.stringify(base) };
        const local = { [key]: JSON.stringify(localWorkspace) };
        const remote = { [key]: JSON.stringify(remoteWorkspace) };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);

        expect(JSON.parse(merged[key]).carePlans.map((plan) => plan.id)).toEqual(['remote-plan', 'local-plan']);
    });

    it('merges separate edits inside the same Nursing Hub record', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baselineWorkspace = { carePlans: [{ id: 'plan-1', title: 'Original', scenario: 'Original case' }] };
        const localWorkspace = { carePlans: [{ id: 'plan-1', title: 'Original', scenario: 'Local case' }] };
        const remoteWorkspace = { carePlans: [{ id: 'plan-1', title: 'Remote title', scenario: 'Original case' }] };
        const baseline = { [key]: JSON.stringify(baselineWorkspace) };
        const local = { [key]: JSON.stringify(localWorkspace) };
        const remote = { [key]: JSON.stringify(remoteWorkspace) };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);

        expect(JSON.parse(merged[key]).carePlans[0]).toEqual({
            id: 'plan-1', title: 'Remote title', scenario: 'Local case',
        });
    });

    it('preserves both versions of a conflicting Nursing Hub text edit', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baselineWorkspace = { carePlans: [{ id: 'plan-1', title: 'Original', scenario: 'Original case' }] };
        const localWorkspace = { carePlans: [{ id: 'plan-1', title: 'Original', scenario: 'Local version' }] };
        const remoteWorkspace = { carePlans: [{ id: 'plan-1', title: 'Original', scenario: 'Remote version' }] };
        const baseline = { [key]: JSON.stringify(baselineWorkspace) };
        const local = { [key]: JSON.stringify(localWorkspace) };
        const remote = { [key]: JSON.stringify(remoteWorkspace) };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);
        const workspace = JSON.parse(merged[key]);

        expect(workspace.carePlans[0].scenario).toBe('Local version');
        expect(workspace.syncConflicts).toHaveLength(1);
        expect(workspace.syncConflicts[0]).toMatchObject({
            path: ['carePlans', 'plan-1', 'scenario'],
            versionA: 'Local version',
            versionB: 'Remote version',
        });
    });

    it('fails closed when Nursing Hub workspace JSON is malformed', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baseline = { [key]: JSON.stringify({ carePlans: [] }) };
        const local = { [key]: '{broken local draft' };
        const remote = { [key]: JSON.stringify({ carePlans: [{ id: 'remote', title: 'Saved remote draft' }] }) };

        expect(() => mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline))
            .toThrow(/paused to protect the saved copy/i);
    });

    it('fails closed when an unchanged remote Nursing workspace is invalid', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baselineWorkspace = { carePlans: [{ id: 'plan-1', title: 'Saved local plan' }] };
        const baseline = { [key]: JSON.stringify(baselineWorkspace), theme: 'light' };
        const local = { [key]: JSON.stringify(baselineWorkspace), theme: 'dark' };
        const remote = { [key]: '{"carePlans":"corrupt remote draft"}', theme: 'light' };

        expect(() => mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline))
            .toThrow(/paused to protect the saved copy/i);
    });

    it('validates local Nursing work before creating a first cloud copy', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const local = { [key]: '{"carePlans":"damaged local copy"}', theme: 'dark' };

        expect(() => mergePreferenceChanges({}, local, new Set(Object.keys(local)), {}))
            .toThrow(/paused to protect the saved copy/i);
    });

    it('preserves a local Nursing workspace when the remote copy is missing', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const workspace = JSON.stringify({ carePlans: [{ id: 'plan-1', title: 'Keep this saved plan' }] });
        const baseline = { [key]: workspace, theme: 'light' };
        const local = { [key]: workspace, theme: 'dark' };
        const remote = { theme: 'light' };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);

        expect(merged[key]).toBe(workspace);
        expect(merged.theme).toBe('dark');
    });

    it.each(['[]', 'null', '{"carePlans":"not an array"}'])(
        'fails closed for parseable but invalid Nursing Hub data: %s',
        (invalidValue) => {
            const key = 'duevinci_workspace_nursing_hub_user-1';
            const baseline = { [key]: JSON.stringify({ carePlans: [] }) };
            const local = { [key]: invalidValue };
            const remote = { [key]: JSON.stringify({ carePlans: [{ id: 'remote', title: 'Saved remote draft' }] }) };

            expect(() => mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline))
                .toThrow(/paused to protect the saved copy/i);
        },
    );

    it('rejects duplicate Nursing Hub IDs and invalid editable field types', () => {
        expect(isValidNursingWorkspaceShape({ carePlans: [
            { id: 'duplicate', title: 'First saved plan' },
            { id: 'duplicate', title: 'Second saved plan' },
        ] })).toBe(false);
        expect(isValidNursingWorkspaceShape({ carePlans: [{ id: 'plan-1', title: { text: 'Not text' } }] })).toBe(false);
        expect(isValidNursingWorkspaceShape({ carePlans: [{ id: 'plan-1 ', title: 'Trimmed ID' }] })).toBe(false);
        expect(isValidNursingWorkspaceShape({ carePlans: [{ id: 'x'.repeat(101), title: 'Too long ID' }] })).toBe(false);
        expect(isValidNursingWorkspaceShape({ dosageProgress: { tablets: { completed: 'false' } } })).toBe(false);
        expect(isValidNursingWorkspaceShape({ cardMastery: { 'starter-dosage': { repetitions: 'not a number' } } })).toBe(false);
        expect(isValidNursingWorkspaceShape({ version: 2, carePlans: [] })).toBe(false);
        expect(isValidNursingWorkspaceShape({ carePlans: [], futureStudyData: { note: 'must be preserved' } })).toBe(false);
    });

    it('pauses sync instead of merging an ambiguous duplicate-ID workspace', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baseline = { [key]: JSON.stringify({ carePlans: [] }) };
        const local = { [key]: JSON.stringify({ carePlans: [
            { id: 'duplicate', title: 'Local one' },
            { id: 'duplicate', title: 'Local two' },
        ] }) };
        const remote = { [key]: JSON.stringify({ carePlans: [{ id: 'remote', title: 'Saved remote plan' }] }) };

        expect(() => mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline))
            .toThrow(/paused to protect the saved copy/i);
    });

    it('pauses sync when independently valid card decks exceed the merged limit', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baseline = { [key]: JSON.stringify({ customCards: [] }) };
        const makeCards = (prefix) => Array.from({ length: 60 }, (_, index) => ({
            id: `${prefix}-${index}`,
            front: `Question ${prefix}-${index}`,
            back: `Answer ${prefix}-${index}`,
        }));
        const local = { [key]: JSON.stringify({ customCards: makeCards('local') }) };
        const remote = { [key]: JSON.stringify({ customCards: makeCards('remote') }) };

        expect(isValidNursingWorkspaceShape(JSON.parse(local[key]))).toBe(true);
        expect(isValidNursingWorkspaceShape(JSON.parse(remote[key]))).toBe(true);
        expect(() => mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline))
            .toThrow(/paused to protect the saved copy/i);
    });

    it('pauses sync when the merged workspace exceeds the save-size limit', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baseline = { [key]: JSON.stringify({ carePlans: [] }) };
        const makePlans = (prefix) => Array.from({ length: 20 }, (_, index) => ({
            id: `${prefix}-${index}`,
            title: `Plan ${prefix}-${index}`,
            scenario: 's'.repeat(1800),
            cues: 'c'.repeat(1800),
            priority: 'p'.repeat(1000),
            outcome: 'o'.repeat(1000),
            actions: 'a'.repeat(1800),
            rationale: 'r'.repeat(1800),
            evaluation: 'e'.repeat(1400),
        }));
        const local = { [key]: JSON.stringify({ carePlans: makePlans('local') }) };
        const remote = { [key]: JSON.stringify({ carePlans: makePlans('remote') }) };

        expect(isValidNursingWorkspaceShape(JSON.parse(local[key]))).toBe(true);
        expect(isValidNursingWorkspaceShape(JSON.parse(remote[key]))).toBe(true);
        expect(local[key].length).toBeLessThan(240000);
        expect(remote[key].length).toBeLessThan(240000);
        expect(() => mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline))
            .toThrow(/paused to protect the saved copy/i);
    });

    it('preserves local Nursing Hub edits when another device deletes that record', () => {
        const key = 'duevinci_workspace_nursing_hub_user-1';
        const baselineWorkspace = { carePlans: [{ id: 'plan-1', title: 'Original', scenario: 'Original case' }] };
        const localWorkspace = { carePlans: [{ id: 'plan-1', title: 'Original', scenario: 'Local case' }] };
        const remoteWorkspace = { carePlans: [] };
        const baseline = { [key]: JSON.stringify(baselineWorkspace) };
        const local = { [key]: JSON.stringify(localWorkspace) };
        const remote = { [key]: JSON.stringify(remoteWorkspace) };

        const merged = mergePreferenceChanges(remote, local, changedPreferenceKeys(baseline, local), baseline);

        expect(JSON.parse(merged[key]).carePlans).toEqual(localWorkspace.carePlans);
    });
});
