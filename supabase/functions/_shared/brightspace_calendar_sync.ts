import { parseBrightspaceCalendar } from './brightspace_ical.ts'
import type { adminClient } from './canvas.ts'

export const BRIGHTSPACE_PROVIDER = 'brightspace'
export const BRIGHTSPACE_MAX_EVENTS = 5000

type AdminClient = ReturnType<typeof adminClient>

export async function saveBrightspaceCalendarEvents(admin: AdminClient, userId: string, calendarText: string) {
  const events = parseBrightspaceCalendar(calendarText, BRIGHTSPACE_MAX_EVENTS)
  const syncedAt = new Date().toISOString()
  if (events.length) {
    const rows = events.map((event) => ({
      user_id: userId,
      title: event.title,
      event_date: event.event_date,
      color: '#0f766e',
      source_provider: BRIGHTSPACE_PROVIDER,
      source_event_id: event.source_event_id,
      source_last_seen_at: syncedAt,
      is_active: true,
    }))
    for (let offset = 0; offset < rows.length; offset += 500) {
      const { error } = await admin.from('custom_events').upsert(rows.slice(offset, offset + 500), {
        onConflict: 'user_id,source_provider,source_event_id',
      })
      if (error) throw new Error('SNHU events could not be saved. Try syncing again.')
    }
  }
  // A valid empty feed is a successful sync too: retire every previous event
  // from this provider while leaving manual events and other users untouched.
  const { error: staleError } = await admin.from('custom_events')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('source_provider', BRIGHTSPACE_PROVIDER)
    .lt('source_last_seen_at', syncedAt)
  if (staleError) throw new Error('SNHU events synced, but older feed entries could not be refreshed.')

  const { error: connectionError } = await admin.from('brightspace_connections')
    .update({ last_synced_at: syncedAt, last_sync_count: events.length, updated_at: syncedAt })
    .eq('user_id', userId)
  if (connectionError) throw new Error('SNHU events synced, but sync status could not be updated.')
  return { count: events.length, syncedAt }
}
