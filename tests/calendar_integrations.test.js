import { describe, expect, it } from 'vitest';
import {
    CALENDAR_SYNC_MAX_EVENTS,
    parseGoogleCalendarEvents,
    parseOutlookCalendarEvents,
    saveProviderCalendarEvents,
} from '../supabase/functions/_shared/calendar_events.ts';
import {
    CalendarConnectionBusyError,
    claimCalendarConnection,
    releaseCalendarConnectionClaim,
} from '../supabase/functions/_shared/calendar_connection_lock.ts';
import { syncCanvasGradeSnapshots } from '../supabase/functions/_shared/canvas_grade_alerts.ts';
import { classifyGoogleRevocationStatus } from '../supabase/functions/_shared/calendar_oauth.ts';
import { googleCalendarDisconnectNotice } from '../js/modules/calendar.js';

function createAdmin(handler) {
    const calls = [];
    return {
        calls,
        from(table) {
            const query = {
                table,
                operation: 'select',
                values: null,
                options: null,
                filters: [],
                select(columns) { this.columns = columns; return this; },
                upsert(values, options) { this.operation = 'upsert'; this.values = values; this.options = options; return this; },
                update(values) { this.operation = 'update'; this.values = values; return this; },
                insert(values) { this.operation = 'insert'; this.values = values; return this; },
                delete() { this.operation = 'delete'; return this; },
                eq(column, value) { this.filters.push(['eq', column, value]); return this; },
                lt(column, value) { this.filters.push(['lt', column, value]); return this; },
                in(column, value) { this.filters.push(['in', column, value]); return this; },
                or(value) { this.filters.push(['or', value]); return this; },
                maybeSingle() {
                    const call = {
                        table: this.table,
                        operation: this.operation,
                        columns: this.columns,
                        values: this.values,
                        options: this.options,
                        filters: [...this.filters],
                    };
                    calls.push(call);
                    return Promise.resolve(handler(call));
                },
                then(resolve, reject) {
                    const call = {
                        table: this.table,
                        operation: this.operation,
                        columns: this.columns,
                        values: this.values,
                        options: this.options,
                        filters: [...this.filters],
                    };
                    calls.push(call);
                    return Promise.resolve(handler(call)).then(resolve, reject);
                },
            };
            return query;
        },
    };
}

describe('calendar provider event normalization', () => {
    it('keeps event local dates, drops cancelled or malformed rows, and deduplicates provider IDs', () => {
        expect(parseGoogleCalendarEvents([
            { id: 'g1', summary: 'Study group', start: { dateTime: '2026-10-19T00:30:00+09:00' } },
            { id: 'g1', summary: 'Updated title', start: { date: '2026-10-20' } },
            { id: 'g2', summary: 'Canceled', status: 'cancelled', start: { date: '2026-10-21' } },
            { id: 'bad-date', summary: 'Bad date', start: { date: '2026-02-31' } },
            { id: 'bad-time', summary: 'Bad timestamp', start: { dateTime: '2026-10-22Tnot-a-time' } },
            { id: '', summary: 'No ID', start: { date: '2026-10-22' } },
        ])).toEqual([
            { source_event_id: 'g1', title: 'Updated title', event_date: '2026-10-20' },
        ]);
    });

    it('normalizes Outlook calendar view records and strips control characters from titles', () => {
        expect(parseOutlookCalendarEvents([
            { id: 'o1', subject: '  Exam\u0007 review  ', start: { dateTime: '2026-11-02T14:00:00.0000000' } },
            { id: 'o2', subject: 'Canceled', isCancelled: true, start: { dateTime: '2026-11-03T09:00:00' } },
        ])).toEqual([
            { source_event_id: 'o1', title: 'Exam review', event_date: '2026-11-02' },
        ]);
    });

    it('rejects an over-limit provider page instead of saving a partial calendar', () => {
        expect(() => parseGoogleCalendarEvents(new Array(CALENDAR_SYNC_MAX_EVENTS + 1))).toThrow(/more events/i);
    });
});

describe('Google Calendar disconnect revocation', () => {
    it('does not tell the user consent was revoked after an HTTP 400 response', () => {
        const providerRevoked = classifyGoogleRevocationStatus(400);
        const notice = googleCalendarDisconnectNotice(providerRevoked);

        expect(providerRevoked).toBe('revocation_failed');
        expect(notice.tone).toBe('muted');
        expect(notice.message).toContain('Google did not confirm revocation');
        expect(notice.message).not.toContain('revoked Google access');
    });

    it('confirms Google revocation only for an HTTP 200 response', () => {
        expect(classifyGoogleRevocationStatus(200)).toBe('revoked');
        expect(classifyGoogleRevocationStatus(204)).toBe('revocation_failed');
        expect(classifyGoogleRevocationStatus(500)).toBe('revocation_failed');
    });
});

describe('calendar provider event persistence', () => {
    it('upserts by stable provider ID and deactivates stale events only for that provider', async () => {
        const admin = createAdmin(() => ({ data: null, error: null }));
        const result = await saveProviderCalendarEvents(admin, 'user-1', 'outlook', [
            { source_event_id: 'o1', title: 'Exam', event_date: '2026-11-02' },
            { source_event_id: 'o1', title: 'Exam updated', event_date: '2026-11-03' },
        ]);

        const eventUpsert = admin.calls.find((call) => call.table === 'custom_events' && call.operation === 'upsert');
        const staleUpdate = admin.calls.find((call) => call.table === 'custom_events' && call.operation === 'update');
        expect(result.count).toBe(1);
        expect(eventUpsert.options.onConflict).toBe('user_id,source_provider,source_event_id');
        expect(eventUpsert.values).toHaveLength(1);
        expect(eventUpsert.values[0]).toMatchObject({
            user_id: 'user-1', source_provider: 'outlook_calendar', source_event_id: 'o1',
            title: 'Exam updated', event_date: '2026-11-03', is_active: true,
        });
        expect(staleUpdate.filters).toContainEqual(['eq', 'source_provider', 'outlook_calendar']);
        expect(staleUpdate.filters).toContainEqual(['eq', 'user_id', 'user-1']);
        expect(admin.calls.some((call) => call.table === 'calendar_connections' && call.operation === 'update')).toBe(true);
    });

    it('deactivates old provider events after a valid empty response', async () => {
        const admin = createAdmin(() => ({ data: null, error: null }));
        await saveProviderCalendarEvents(admin, 'user-1', 'google', []);
        expect(admin.calls.some((call) => call.table === 'custom_events' && call.operation === 'upsert')).toBe(false);
        expect(admin.calls.find((call) => call.table === 'custom_events' && call.operation === 'update').filters)
            .toContainEqual(['eq', 'source_provider', 'google_calendar']);
    });

    it('keeps prior events active when a new event batch fails to save', async () => {
        const admin = createAdmin((call) => call.table === 'custom_events' && call.operation === 'upsert'
            ? { data: null, error: new Error('write failed') }
            : { data: null, error: null });
        await expect(saveProviderCalendarEvents(admin, 'user-1', 'google', [
            { source_event_id: 'g1', title: 'Lecture', event_date: '2026-11-04' },
        ])).rejects.toThrow(/could not be saved/i);
        expect(admin.calls.some((call) => call.table === 'custom_events' && call.operation === 'update')).toBe(false);
    });
});

describe('calendar provider connection claims', () => {
    it('atomically claims an idle connection and releases only that claim', async () => {
        const row = { provider: 'google', access_token_encrypted: 'encrypted' };
        const admin = createAdmin((call) => ({ data: call.operation === 'update' ? row : null, error: null }));
        const claim = await claimCalendarConnection(admin, 'user-1', 'google', 'provider,access_token_encrypted');

        expect(claim).toMatchObject({ connection: row });
        const claimCall = admin.calls[0];
        expect(claimCall.operation).toBe('update');
        expect(claimCall.values).toMatchObject({ sync_claimed_at: claim.claimedAt });
        expect(claimCall.filters).toContainEqual(['or', expect.stringMatching(/^sync_claimed_at\.is\.null,sync_claimed_at\.lt\./)]);

        await releaseCalendarConnectionClaim(admin, 'user-1', 'google', claim.claimedAt);
        expect(admin.calls[1].values.sync_claimed_at).toBeNull();
        expect(admin.calls[1].filters).toContainEqual(['eq', 'sync_claimed_at', claim.claimedAt]);
    });

    it('reports a busy connection instead of starting a second operation', async () => {
        const admin = createAdmin((call) => ({
            data: call.operation === 'select' ? { provider: 'google' } : null,
            error: null,
        }));
        await expect(claimCalendarConnection(admin, 'user-1', 'google', 'provider'))
            .rejects.toBeInstanceOf(CalendarConnectionBusyError);
        expect(admin.calls).toHaveLength(2);
        expect(admin.calls[0].operation).toBe('update');
        expect(admin.calls[1].operation).toBe('select');
    });
});

describe('Canvas posted-grade snapshots', () => {
    const assignment = {
        id: 19,
        name: 'Unit exam',
        points_possible: 50,
        submission: { grade: '42', score: 42, posted_at: '2026-10-17T15:00:00Z', grade_matches_current_submission: true },
    };

    it('establishes an initial baseline without alerting about old posted grades', async () => {
        const admin = createAdmin((call) => call.operation === 'select'
            ? { data: [], error: null }
            : { data: null, error: null });
        let callbackCalled = false;
        const changes = await syncCanvasGradeSnapshots(admin, 'user-1', 'course-1', 'BIO', [assignment], async () => {
            callbackCalled = true;
        });

        expect(changes).toEqual([]);
        expect(callbackCalled).toBe(false);
        expect(admin.calls.some((call) => call.table === 'canvas_grade_snapshots' && call.operation === 'upsert')).toBe(true);
    });

    it('notifies before storing a changed posted grade so failed delivery can retry', async () => {
        const prior = {
            canvas_assignment_id: '19', assignment_title: 'Unit exam', grade: '40', score: 40,
            points_possible: 50, posted_at: '2026-10-10T15:00:00.000Z',
        };
        const order = [];
        const admin = createAdmin((call) => {
            if (call.table === 'canvas_grade_snapshots' && call.operation === 'upsert') order.push('persist');
            return call.operation === 'select' ? { data: [prior], error: null } : { data: null, error: null };
        });
        const changes = await syncCanvasGradeSnapshots(admin, 'user-1', 'course-1', 'BIO', [assignment], async (items) => {
            order.push('notify');
            expect(items).toEqual([{
                sourceId: '19', title: 'Unit exam', courseCode: 'BIO', grade: '42', score: 42,
                pointsPossible: 50, postedAt: '2026-10-17T15:00:00.000Z',
            }]);
        });

        expect(changes).toHaveLength(1);
        expect(order).toEqual(['notify', 'persist']);
    });

    it('does not advance the snapshot if the alert handler fails', async () => {
        const prior = {
            canvas_assignment_id: '19', assignment_title: 'Unit exam', grade: '40', score: 40,
            points_possible: 50, posted_at: '2026-10-10T15:00:00.000Z',
        };
        const admin = createAdmin((call) => call.operation === 'select'
            ? { data: [prior], error: null }
            : { data: null, error: null });
        await expect(syncCanvasGradeSnapshots(admin, 'user-1', 'course-1', 'BIO', [assignment], async () => {
            throw new Error('push unavailable');
        })).rejects.toThrow('push unavailable');
        expect(admin.calls.some((call) => call.table === 'canvas_grade_snapshots' && call.operation === 'upsert')).toBe(false);
    });

    it('does not alert when Canvas says the visible grade belongs to an older submission', async () => {
        const previous = {
            canvas_assignment_id: '19', assignment_title: 'Unit exam', grade: null, score: null,
            points_possible: 50, posted_at: null,
        };
        const admin = createAdmin((call) => call.operation === 'select'
            ? { data: [previous], error: null }
            : { data: null, error: null });
        const changes = await syncCanvasGradeSnapshots(admin, 'user-1', 'course-1', 'BIO', [{
            ...assignment, submission: { ...assignment.submission, grade_matches_current_submission: false },
        }]);
        expect(changes).toEqual([]);
    });
});
