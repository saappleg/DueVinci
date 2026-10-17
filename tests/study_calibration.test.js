import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSubscriptionSnapshot } from '../js/modules/subscription.js';

vi.mock('../js/modules/subscription.js', () => ({
    getSubscriptionSnapshot: vi.fn(),
    hasSubscriptionFeature: (snapshot, featureKey) => snapshot?.features?.[featureKey] === true,
}));
import {
    STUDY_CALIBRATION_ENABLED_KEY,
    STUDY_CALIBRATION_HISTORY_KEY,
    calculateStudyCalibration,
    getPersonalizedStudyEstimate,
    recordCompletedFocusSession,
    recordCompletedFocusSessionIfEntitled,
    recordStudyPlanCompletion,
} from '../js/modules/studyCalibration.js';

describe('Study plan calibration', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(STUDY_CALIBRATION_ENABLED_KEY, 'true');
        vi.mocked(getSubscriptionSnapshot).mockReset();
    });

    it('uses completed focus sessions paired with finished study-plan tasks', () => {
        const now = Date.parse('2026-10-15T12:00:00Z');
        const history = {
            version: 1,
            sessions: [
                { taskId: 'a1', minutes: 50, recordedAt: '2026-10-10T12:00:00Z' },
                { taskId: 'a2', minutes: 45, recordedAt: '2026-10-11T12:00:00Z' },
                { taskId: 'unlinked', minutes: 30, recordedAt: '2026-10-12T12:00:00Z' },
            ],
            completions: [
                { taskId: 'a1', taskType: 'lesson', estimatedMinutes: 25, completedAt: '2026-10-10T13:00:00Z' },
                { taskId: 'a2', taskType: 'lesson', estimatedMinutes: 25, completedAt: '2026-10-11T13:00:00Z' },
                { taskId: 'old', taskType: 'lesson', estimatedMinutes: 25, completedAt: '2026-06-01T13:00:00Z' },
            ],
        };
        const result = calculateStudyCalibration(history, now);
        expect(result.trackedTaskCount).toBe(2);
        expect(result.focusSessionCount).toBe(3);
        expect(result.totalFocusMinutes).toBe(125);
        expect(result.ratios.lesson).toBeGreaterThan(1);
        expect(getPersonalizedStudyEstimate({ task_type: 'lesson' }, 25, result)).toBeGreaterThan(25);
    });

    it('records bounded focus sessions and one completion snapshot per task', () => {
        recordCompletedFocusSession({ taskId: 'a1', courseId: 'c1', taskType: 'reading', minutes: 35 });
        recordStudyPlanCompletion({ taskId: 'a1', courseId: 'c1', taskType: 'reading', estimatedMinutes: 30 });
        recordStudyPlanCompletion({ taskId: 'a1', courseId: 'c1', taskType: 'reading', estimatedMinutes: 35 });
        const history = JSON.parse(localStorage.getItem(STUDY_CALIBRATION_HISTORY_KEY));
        expect(history.sessions).toHaveLength(1);
        expect(history.completions).toHaveLength(1);
        expect(history.completions[0].estimatedMinutes).toBe(35);
        expect(recordCompletedFocusSession({ taskId: 'invalid', minutes: 999 })).toBe(false);
    });

    it('does not save history when the student has not opted in', () => {
        localStorage.setItem(STUDY_CALIBRATION_ENABLED_KEY, 'false');
        expect(recordCompletedFocusSession({ taskId: 'a1', minutes: 25 })).toBe(false);
        expect(localStorage.getItem(STUDY_CALIBRATION_HISTORY_KEY)).toBeNull();
    });

    it('keeps saved estimates unchanged when calibration is not active', () => {
        expect(getPersonalizedStudyEstimate({ task_type: 'lesson' }, 400, null)).toBe(400);
    });

    it('does not save study history after Pro entitlement is unavailable', async () => {
        vi.mocked(getSubscriptionSnapshot).mockResolvedValue({ features: { study_plan_calibration: false } });
        expect(await recordCompletedFocusSessionIfEntitled({ taskId: 'a1', minutes: 25 })).toBe(false);
        expect(localStorage.getItem(STUDY_CALIBRATION_HISTORY_KEY)).toBeNull();
    });
});
