import { describe, it, expect, beforeAll } from 'vitest';

describe('Timer Utilities', () => {
    let createTimerState;
    let stepTimerState;
    let formatTimerTime;

    beforeAll(async () => {
        await import('../timers.js');
        createTimerState = globalThis.createTimerState;
        stepTimerState = globalThis.stepTimerState;
        formatTimerTime = globalThis.formatTimerTime;
    });

    describe('createTimerState', () => {
        it('creates default timer state with proper defaults', () => {
            const timer = createTimerState('test_1', 'Biology Study');
            expect(timer.id).toBe('test_1');
            expect(timer.name).toBe('Biology Study');
            expect(timer.focusMin).toBe(25);
            expect(timer.breakMin).toBe(5);
            expect(timer.timeLeft).toBe(25 * 60);
            expect(timer.isWorking).toBe(true);
            expect(timer.running).toBe(false);
        });

        it('supports custom focus and break durations', () => {
            const timer = createTimerState('custom', 'Deep Work', 50, 10);
            expect(timer.focusMin).toBe(50);
            expect(timer.breakMin).toBe(10);
            expect(timer.timeLeft).toBe(50 * 60);
        });
    });

    describe('formatTimerTime', () => {
        it('formats MM:SS correctly', () => {
            expect(formatTimerTime(1500)).toBe('25:00');
            expect(formatTimerTime(65)).toBe('01:05');
            expect(formatTimerTime(9)).toBe('00:09');
            expect(formatTimerTime(0)).toBe('00:00');
        });
    });

    describe('stepTimerState', () => {
        it('does not decrement when running is false', () => {
            const timer = createTimerState('t1', 'Focus', 25, 5);
            const stepped = stepTimerState(timer);
            expect(stepped.timeLeft).toBe(25 * 60);
        });

        it('decrements time by 1 second when running', () => {
            const timer = { ...createTimerState('t1', 'Focus', 25, 5), running: true };
            const stepped = stepTimerState(timer);
            expect(stepped.timeLeft).toBe(25 * 60 - 1);
        });

        it('switches from focus session to break when timeLeft reaches 0', () => {
            const timer = {
                id: 't1',
                name: 'Focus',
                focusMin: 25,
                breakMin: 5,
                timeLeft: 0,
                isWorking: true,
                running: true
            };
            const stepped = stepTimerState(timer);
            expect(stepped.isWorking).toBe(false);
            expect(stepped.timeLeft).toBe(5 * 60);
        });

        it('switches from break to focus session when break timer reaches 0', () => {
            const timer = {
                id: 't1',
                name: 'Focus',
                focusMin: 25,
                breakMin: 5,
                timeLeft: 0,
                isWorking: false,
                running: true
            };
            const stepped = stepTimerState(timer);
            expect(stepped.isWorking).toBe(true);
            expect(stepped.timeLeft).toBe(25 * 60);
        });
    });
});
