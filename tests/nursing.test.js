import { describe, expect, it } from 'vitest';
import {
    ANATOMY_SYSTEMS,
    DOSAGE_PROBLEMS,
    buildNursingReviewQueue,
    calculateDosagePracticeAnswer,
    createEmptyNursingWorkspace,
    getNursingStorageKey,
    isDosageAnswerCorrect,
    sanitizeNursingWorkspace
} from '../js/modules/nursing.js';

describe('Nursing Hub learning tools', () => {
    it('calculates tablet and liquid practice amounts with desired ÷ have × quantity', () => {
        expect(calculateDosagePracticeAnswer(DOSAGE_PROBLEMS[0])).toBe(2);
        expect(calculateDosagePracticeAnswer(DOSAGE_PROBLEMS[1])).toBe(10);
    });

    it('calculates pump and gravity practice rates, rounding drops to a whole number', () => {
        expect(calculateDosagePracticeAnswer(DOSAGE_PROBLEMS[2])).toBe(125);
        expect(calculateDosagePracticeAnswer(DOSAGE_PROBLEMS[3])).toBe(42);
    });

    it('accepts the correct numeric answer with an optional matching unit', () => {
        expect(isDosageAnswerCorrect('2 tablets', 2)).toBe(true);
        expect(isDosageAnswerCorrect('2 tablet', 2, 'tablets')).toBe(true);
        expect(isDosageAnswerCorrect('2 tab', 2, 'tablets')).toBe(true);
        expect(isDosageAnswerCorrect('2 tabs', 2, 'tablets')).toBe(true);
        expect(isDosageAnswerCorrect('2 mL', 2, 'tablets')).toBe(false);
        expect(isDosageAnswerCorrect('10 mL', 10)).toBe(true);
        expect(isDosageAnswerCorrect('125 mL/hr', 125)).toBe(true);
        expect(isDosageAnswerCorrect('125 tablets', 125, 'mL/hr')).toBe(false);
        expect(isDosageAnswerCorrect('10 gtt/min', 10, 'mL')).toBe(false);
        expect(isDosageAnswerCorrect('41 gtt/min', 42)).toBe(false);
        expect(isDosageAnswerCorrect('ten', 10)).toBe(false);
    });

    it('builds a balanced quick-review queue from due cards and unfinished practice', () => {
        const queue = buildNursingReviewQueue({
            cards: [
                { id: 'due-card', topic: 'Anatomy', front: 'Review this now' },
                { id: 'future-card', topic: 'Later', front: 'Not due yet' }
            ],
            cardMastery: { 'future-card': { nextReviewDate: '2026-10-17' } },
            dosageProgress: { tablets: { completed: true } },
            completedSystems: ['skeletal'],
            today: '2026-10-16',
            limit: 10
        });

        expect(queue.some((item) => item.type === 'flashcard' && item.id === 'due-card')).toBe(true);
        expect(queue.some((item) => item.id === 'future-card')).toBe(false);
        expect(queue.some((item) => item.type === 'dosage' && item.id === 'tablets')).toBe(false);
        expect(queue.some((item) => item.type === 'anatomy' && item.id === 'skeletal')).toBe(false);
        expect(new Set(queue.map((item) => item.type))).toEqual(new Set(['flashcard', 'dosage', 'anatomy']));
    });

    it('interleaves review types and caps the quick queue at twelve items', () => {
        const cards = Array.from({ length: 30 }, (_, index) => ({ id: 'card-' + index, topic: 'Topic', front: 'Prompt' }));
        const queue = buildNursingReviewQueue({ cards, limit: 99, today: '2026-10-16' });

        expect(queue).toHaveLength(12);
        expect(queue.slice(0, 6).map((item) => item.type)).toEqual(['flashcard', 'dosage', 'anatomy', 'flashcard', 'dosage', 'anatomy']);
    });

    it('rejects unsafe or malformed calculation inputs', () => {
        expect(() => calculateDosagePracticeAnswer({ type: 'dose', desiredDose: 10, availableDose: 0, quantity: 1 })).toThrow();
        expect(() => calculateDosagePracticeAnswer({ type: 'unknown' })).toThrow();
    });

    it('provides all eleven anatomy-system review topics', () => {
        expect(ANATOMY_SYSTEMS).toHaveLength(11);
        expect(new Set(ANATOMY_SYSTEMS.map((system) => system.id)).size).toBe(11);
        expect(ANATOMY_SYSTEMS.find((system) => system.id === 'cardiovascular').structures).toContain('Heart');
    });

    it('sanitizes and bounds persisted workspace data', () => {
        const state = sanitizeNursingWorkspace({
            rotations: [{ id: 'r1', name: '<Rotation>', startDate: '2026-02-31', skills: [{ id: 's1', name: 'Vitals', status: 'admin' }] }],
            carePlans: [{ id: 'c1', title: 'Practice', scenario: 'Fiction only', createdAt: '2026-10-15T12:00:00Z' }],
            customCards: [{ id: 'f1', topic: 'Anatomy', front: 'Front', back: 'Back' }],
            completedSystems: ['nervous', 'not-a-system'],
            dosageProgress: { tablets: { attempts: 4, correct: 3 }, 'not-a-problem': { attempts: 5, correct: 5 } }
        });

        expect(state.rotations[0].name).toBe('<Rotation>');
        expect(state.rotations[0].startDate).toBe('');
        expect(state.rotations[0].skills[0].status).toBe('planned');
        expect(state.carePlans[0].scenario).toBe('Fiction only');
        expect(state.customCards).toHaveLength(1);
        expect(state.completedSystems).toEqual(['nervous', 'not-a-system']);
        expect(state.dosageProgress).toEqual({ tablets: { attempts: 4, correct: 3, completed: false } });
    });

    it('creates an account-scoped storage key and an empty workspace', () => {
        expect(getNursingStorageKey('user-123')).toBe('duevinci_workspace_nursing_hub_user-123');
        expect(getNursingStorageKey('')).toBe('');
        expect(createEmptyNursingWorkspace()).toMatchObject({ version: 1, rotations: [], carePlans: [], customCards: [] });
    });
});
