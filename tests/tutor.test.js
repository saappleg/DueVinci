import { describe, expect, it } from 'vitest';
import { isTutorAccessActive } from '../js/modules/tutor.js';

describe('Socratic Tutor entitlement UI', () => {
    const now = Date.parse('2026-08-24T12:00:00Z');

    it('allows active subscriptions and unexpired trials', () => {
        expect(isTutorAccessActive({ subscription_status: 'active' }, now)).toBe(true);
        expect(isTutorAccessActive({ subscription_status: 'trialing', trial_end: '2026-08-25T12:00:00Z' }, now)).toBe(true);
    });

    it('keeps inactive and expired subscriptions locked', () => {
        expect(isTutorAccessActive({ subscription_status: 'inactive' }, now)).toBe(false);
        expect(isTutorAccessActive({ subscription_status: 'trialing', trial_end: '2026-08-23T12:00:00Z' }, now)).toBe(false);
    });
});
