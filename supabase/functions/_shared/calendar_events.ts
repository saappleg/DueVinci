import type { adminClient } from './canvas.ts'

export type ProviderCalendarEvent = {
  source_event_id: string
  title: string
  event_date: string
}

export const CALENDAR_SYNC_MAX_EVENTS = 5000

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function eventDate(value: unknown) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)$/i)
  if (!match || !isValidDate(match[1])) return ''
  return match[1]
}

function cleanTitle(value: unknown) {
  const title = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  return title.slice(0, 300) || 'Untitled calendar event'
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeEvent(id: unknown, title: unknown, start: unknown): ProviderCalendarEvent | null {
  const eventId = (typeof id === 'string' || typeof id === 'number') ? String(id).trim() : ''
  const date = eventDate(start)
  if (!eventId || eventId.length > 512 || !date) return null
  return { source_event_id: eventId, title: cleanTitle(typeof title === 'string' ? title : ''), event_date: date }
}

export function parseGoogleCalendarEvents(items: unknown[] = [], maxEvents = CALENDAR_SYNC_MAX_EVENTS) {
  if (!Array.isArray(items) || items.length > maxEvents) throw new Error('Google Calendar returned more events than DueVinci can sync in one pass.')
  const events = new Map<string, ProviderCalendarEvent>()
  for (const raw of items) {
    const item = recordValue(raw)
    if (!item) continue
    if (item.status === 'cancelled') continue
    const start = recordValue(item.start)
    const normalized = normalizeEvent(item.id, item.summary, start?.date || start?.dateTime)
    if (normalized) events.set(normalized.source_event_id, normalized)
  }
  return [...events.values()]
}

export function parseOutlookCalendarEvents(items: unknown[] = [], maxEvents = CALENDAR_SYNC_MAX_EVENTS) {
  if (!Array.isArray(items) || items.length > maxEvents) throw new Error('Outlook returned more events than DueVinci can sync in one pass.')
  const events = new Map<string, ProviderCalendarEvent>()
  for (const raw of items) {
    const item = recordValue(raw)
    if (!item) continue
    if (item.isCancelled === true) continue
    const start = recordValue(item.start)
    const normalized = normalizeEvent(item.id, item.subject, start?.dateTime)
    if (normalized) events.set(normalized.source_event_id, normalized)
  }
  return [...events.values()]
}

type AdminClient = ReturnType<typeof adminClient>

export async function saveProviderCalendarEvents(
  admin: AdminClient,
  userId: string,
  provider: 'google' | 'outlook',
  events: ProviderCalendarEvent[],
  claimedAt?: string,
) {
  if (!Array.isArray(events) || events.length > CALENDAR_SYNC_MAX_EVENTS) {
    throw new Error('Calendar sync exceeded the supported event limit.')
  }
  const syncedAt = new Date().toISOString()
  const sourceProvider = provider === 'google' ? 'google_calendar' : 'outlook_calendar'
  const color = provider === 'google' ? '#2563eb' : '#0078d4'
  const unique = new Map(events.map((event) => [event.source_event_id, event]))
  const rows = [...unique.values()].map((event) => ({
    user_id: userId,
    title: event.title,
    event_date: event.event_date,
    color,
    source_provider: sourceProvider,
    source_event_id: event.source_event_id,
    source_last_seen_at: syncedAt,
    is_active: true,
  }))

  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await admin.from('custom_events').upsert(rows.slice(offset, offset + 500), {
      onConflict: 'user_id,source_provider,source_event_id',
    })
    if (error) throw new Error('Calendar events could not be saved. Try syncing again.')
  }

  const { error: staleError } = await admin.from('custom_events')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('source_provider', sourceProvider)
    .lt('source_last_seen_at', syncedAt)
  if (staleError) throw new Error('Calendar events synced, but older entries could not be refreshed.')

  let connectionUpdate = admin.from('calendar_connections')
    .update({ last_synced_at: syncedAt, last_sync_count: rows.length, last_sync_error: null, sync_claimed_at: null, updated_at: syncedAt })
    .eq('user_id', userId)
    .eq('provider', provider)
  if (claimedAt) connectionUpdate = connectionUpdate.eq('sync_claimed_at', claimedAt)
  const { error: connectionError } = await connectionUpdate
  if (connectionError) throw new Error('Calendar events synced, but connection status could not be updated.')
  return { count: rows.length, syncedAt }
}
