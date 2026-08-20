import { describe, it, expect, beforeAll } from 'vitest';

describe('SuperMemo SM-2 Spaced Repetition Engine', () => {
    let calculateSM2Repetition;

    beforeAll(async () => {
        const mod = await import('../js/modules/flashcards.js');
        calculateSM2Repetition = mod.calculateSM2Repetition || globalThis.calculateSM2Repetition;
    });

    describe('calculateSM2Repetition', () => {
        it('initializes new card on first successful review with 1 day interval', () => {
            const card = { repetitions: 0, interval: 1, easinessFactor: 2.5 };
            const result = calculateSM2Repetition(card, 4); // Good
            expect(result.repetitions).toBe(1);
            expect(result.interval).toBe(1);
            expect(result.easinessFactor).toBe(2.5);
            expect(result.nextReviewDate).toBeDefined();
        });

        it('increases interval to 6 days on second successful review', () => {
            const card = { repetitions: 1, interval: 1, easinessFactor: 2.5 };
            const result = calculateSM2Repetition(card, 4); // Good
            expect(result.repetitions).toBe(2);
            expect(result.interval).toBe(6);
        });

        it('scales interval by Easiness Factor on subsequent reviews', () => {
            const card = { repetitions: 2, interval: 6, easinessFactor: 2.5 };
            const result = calculateSM2Repetition(card, 5); // Easy
            expect(result.repetitions).toBe(3);
            expect(result.interval).toBe(16); // 6 * 2.6 = 15.6 -> 16
            expect(result.easinessFactor).toBe(2.6);
        });

        it('resets repetitions and interval to 1 on blackout or failure (rating < 3)', () => {
            const card = { repetitions: 5, interval: 35, easinessFactor: 2.6 };
            const result = calculateSM2Repetition(card, 1); // Again / Forgot
            expect(result.repetitions).toBe(0);
            expect(result.interval).toBe(1);
            expect(result.easinessFactor).toBeLessThan(2.6);
        });

        it('enforces minimum Easiness Factor floor of 1.3', () => {
            const card = { repetitions: 0, interval: 1, easinessFactor: 1.3 };
            const result = calculateSM2Repetition(card, 0); // Complete Blackout
            expect(result.easinessFactor).toBe(1.3);
        });
    });
});
