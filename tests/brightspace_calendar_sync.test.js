import { describe, expect, it } from 'vitest';
import { saveBrightspaceCalendarEvents } from '../supabase/functions/_shared/brightspace_calendar_sync.ts';

const USER_ID = 'user-1';
const EMPTY_FEED = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

function feedWithEvent(title = 'Fictional study event') {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 7);
    const date = start.toISOString().slice(0, 10).replaceAll('-', '');
    return [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:event-1',
        `SUMMARY:${title}`, `DTSTART;VALUE=DATE:${date}`, 'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
}

function fakeAdmin(initialEvents = [], { upsertError = null, staleError = null } = {}) {
    const events = initialEvents.map((event) => ({ ...event }));
    const calls = [];
    const connectionUpdates = [];

    const matches = (row, filters) => filters.every((filter) => {
        if (filter.operator === 'eq') return row[filter.column] === filter.value;
        if (filter.operator === 'lt') return row[filter.column] != null && row[filter.column] < filter.value;
        return false;
    });

    const updateQuery = (table, payload) => {
        const filters = [];
        const query = {
            eq(column, value) { filters.push({ operator: 'eq', column, value }); return query; },
            lt(column, value) { filters.push({ operator: 'lt', column, value }); return query; },
            then(resolve, reject) {
                if (table === 'custom_events') {
                    calls.push({ type: 'stale-update', payload, filters: [...filters] });
                    if (!staleError) {
                        events.forEach((row) => {
                            if (matches(row, filters)) Object.assign(row, payload);
                        });
                    }
                    return Promise.resolve({ error: staleError }).then(resolve, reject);
                }
                connectionUpdates.push({ payload, filters: [...filters] });
                return Promise.resolve({ error: null }).then(resolve, reject);
            },
        };
        return query;
    };

    return {
        events,
        calls,
        connectionUpdates,
        from(table) {
            if (table === 'custom_events') {
                return {
                    upsert(rows, options) {
                        calls.push({ type: 'upsert', rows: rows.map((row) => ({ ...row })), options });
                        if (upsertError) return Promise.resolve({ error: upsertError });
                        rows.forEach((incoming) => {
                            const existing = events.find((row) => row.user_id === incoming.user_id
                                && row.source_provider === incoming.source_provider
                                && row.source_event_id === incoming.source_event_id);
                            if (existing) Object.assign(existing, incoming);
                            else events.push({ id: `event-${events.length + 1}`, ...incoming });
                        });
                        return Promise.resolve({ error: null });
                    },
                    update(payload) { return updateQuery(table, payload); },
                };
            }
            if (table === 'brightspace_connections') return { update: (payload) => updateQuery(table, payload) };
            throw new Error(`Unexpected table: ${table}`);
        },
    };
}

describe('Brightspace calendar sync persistence', () => {
    it('deactivates stale SNHU entries when a valid feed contains zero events', async () => {
        const admin = fakeAdmin([
            { user_id: USER_ID, source_provider: 'brightspace', source_event_id: 'removed-1', source_last_seen_at: '2026-01-01T00:00:00.000Z', is_active: true },
            { user_id: 'user-2', source_provider: 'brightspace', source_event_id: 'other-user', source_last_seen_at: '2026-01-01T00:00:00.000Z', is_active: true },
            { user_id: USER_ID, source_provider: null, source_event_id: null, source_last_seen_at: null, is_active: true },
        ]);

        const result = await saveBrightspaceCalendarEvents(admin, USER_ID, EMPTY_FEED);

        expect(result.count).toBe(0);
        expect(admin.events.find((row) => row.source_event_id === 'removed-1').is_active).toBe(false);
        expect(admin.events.find((row) => row.source_event_id === 'other-user').is_active).toBe(true);
        expect(admin.events.find((row) => row.source_provider === null).is_active).toBe(true);
        expect(admin.calls.filter((call) => call.type === 'upsert')).toHaveLength(0);
        expect(admin.calls.filter((call) => call.type === 'stale-update')).toHaveLength(1);
        expect(admin.connectionUpdates[0].payload.last_sync_count).toBe(0);
    });

    it('upserts current feed rows and deactivates only older unseen SNHU rows', async () => {
        const admin = fakeAdmin([
            { user_id: USER_ID, source_provider: 'brightspace', source_event_id: 'old-event', source_last_seen_at: '2026-01-01T00:00:00.000Z', is_active: true },
            { user_id: USER_ID, source_provider: 'brightspace', source_event_id: 'event-1|2099-01-01', source_last_seen_at: '2026-01-01T00:00:00.000Z', is_active: false },
        ]);

        const result = await saveBrightspaceCalendarEvents(admin, USER_ID, feedWithEvent());

        expect(result.count).toBe(1);
        expect(admin.events.find((row) => row.source_event_id === 'old-event').is_active).toBe(false);
        expect(admin.events.find((row) => row.title === 'Fictional study event').is_active).toBe(true);
        expect(admin.calls.find((call) => call.type === 'upsert').options.onConflict)
            .toBe('user_id,source_provider,source_event_id');
        expect(admin.connectionUpdates[0].payload.last_sync_count).toBe(1);
    });

    it('does not deactivate existing entries when the feed is malformed or upsert fails', async () => {
        const oldEntry = { user_id: USER_ID, source_provider: 'brightspace', source_event_id: 'keep-me', source_last_seen_at: '2026-01-01T00:00:00.000Z', is_active: true };
        const malformedAdmin = fakeAdmin([oldEntry]);
        await expect(saveBrightspaceCalendarEvents(malformedAdmin, USER_ID, 'not an ICS feed'))
            .rejects.toThrow('valid calendar feed');
        expect(malformedAdmin.calls).toHaveLength(0);
        expect(malformedAdmin.events[0].is_active).toBe(true);

        const failedWriteAdmin = fakeAdmin([oldEntry], { upsertError: new Error('write failed') });
        await expect(saveBrightspaceCalendarEvents(failedWriteAdmin, USER_ID, feedWithEvent()))
            .rejects.toThrow('SNHU events could not be saved');
        expect(failedWriteAdmin.calls.map((call) => call.type)).toEqual(['upsert']);
        expect(failedWriteAdmin.events[0].is_active).toBe(true);
        expect(failedWriteAdmin.connectionUpdates).toHaveLength(0);

        const failedRetirementAdmin = fakeAdmin([oldEntry], { staleError: new Error('retirement failed') });
        await expect(saveBrightspaceCalendarEvents(failedRetirementAdmin, USER_ID, EMPTY_FEED))
            .rejects.toThrow('older feed entries could not be refreshed');
        expect(failedRetirementAdmin.events[0].is_active).toBe(true);
        expect(failedRetirementAdmin.connectionUpdates).toHaveLength(0);
    });
});
