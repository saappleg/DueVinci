import { adminClient, corsHeaders, authenticatedUser, hasFeature, isSubscriptionActive, json, requireFeature } from '../_shared/canvas.ts'
import { decryptConnectionSecret, encryptConnectionSecret } from '../_shared/canvas_crypto.ts'
import { parseBrightspaceCalendar } from '../_shared/brightspace_ical.ts'

const PROVIDER = 'brightspace'
const MAX_FEED_BYTES = 3 * 1024 * 1024
const MAX_EVENTS = 5000
type AdminClient = ReturnType<typeof adminClient>
const brightspaceCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

function normalizeFeedUrl(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 4096) throw new Error('Paste the private Brightspace calendar feed link.')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Paste a valid Brightspace calendar feed link.') }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'learn.snhu.edu'
    || (url.port && url.port !== '443') || url.username || url.password || url.hash
    || !url.pathname.toLowerCase().startsWith('/d2l/le/calendar/')) {
    throw new Error('Use the HTTPS calendar feed link copied from your SNHU Brightspace account.')
  }
  return url.toString()
}

async function fetchCalendarFeed(url: string) {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw new Error('Could not reach your SNHU calendar feed. Check the link and try again.')
  }
  if (response.status >= 300 && response.status < 400) throw new Error('SNHU redirected the feed request. Re-copy the calendar feed link and reconnect it.')
  if (!response.ok) throw new Error(`SNHU calendar feed returned HTTP ${response.status}. Re-copy the link if it has expired.`)
  const length = Number(response.headers.get('content-length') || 0)
  if (length > MAX_FEED_BYTES) throw new Error('The SNHU calendar feed is larger than the supported limit.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('SNHU returned an empty calendar response. Re-copy the feed link and try again.')
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_FEED_BYTES) {
        await reader.cancel()
        throw new Error('The SNHU calendar feed is larger than the supported limit.')
      }
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function saveCalendarEvents(admin: AdminClient, userId: string, calendarText: string) {
  const events = parseBrightspaceCalendar(calendarText, MAX_EVENTS)
  const syncedAt = new Date().toISOString()
  if (events.length) {
    const rows = events.map((event) => ({
      user_id: userId,
      title: event.title,
      event_date: event.event_date,
      color: '#0f766e',
      source_provider: PROVIDER,
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
    const { error: staleError } = await admin.from('custom_events')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('source_provider', PROVIDER)
      .lt('source_last_seen_at', syncedAt)
    if (staleError) throw new Error('SNHU events synced, but older feed entries could not be refreshed.')
  }
  const { error: connectionError } = await admin.from('brightspace_connections')
    .update({ last_synced_at: syncedAt, last_sync_count: events.length, updated_at: syncedAt })
    .eq('user_id', userId)
  if (connectionError) throw new Error('SNHU events synced, but sync status could not be updated.')
  return { count: events.length, syncedAt }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: brightspaceCorsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST for Brightspace calendar actions.' }, 405)
  try {
    const body = await req.json()
    const action = String(body?.action || 'status')

    if (action === 'disconnect' || action === 'status') {
      const { admin, user } = await authenticatedUser(req)
      if (action === 'status') {
        const { data, error } = await admin.from('brightspace_connections')
          .select('last_synced_at,last_sync_count').eq('user_id', user.id).maybeSingle()
        if (error) throw error
        const { data: profile, error: profileError } = await admin.from('profiles')
          .select('subscription_status,trial_end,subscription_plan').eq('user_id', user.id).maybeSingle()
        if (profileError) throw profileError
        const featureEnabled = isSubscriptionActive(profile) && await hasFeature(admin, profile || {}, 'brightspace_sync')
        return json({ connected: Boolean(data), featureEnabled, lastSyncedAt: data?.last_synced_at || null, lastSyncCount: data?.last_sync_count || 0 })
      }
      const { error } = await admin.from('brightspace_connections').delete().eq('user_id', user.id)
      if (error) throw error
      return json({ success: true, connected: false })
    }

    const { admin, user } = await requireFeature(req, 'brightspace_sync')
    if (action === 'connect') {
      const feedUrl = normalizeFeedUrl(body?.feedUrl)
      const calendarText = await fetchCalendarFeed(feedUrl)
      parseBrightspaceCalendar(calendarText, MAX_EVENTS)
      const now = new Date().toISOString()
      const { error } = await admin.from('brightspace_connections').upsert({
        user_id: user.id,
        feed_url_encrypted: await encryptConnectionSecret(feedUrl),
        updated_at: now,
      }, { onConflict: 'user_id' })
      if (error) throw error
      const sync = await saveCalendarEvents(admin, user.id, calendarText)
      return json({ success: true, connected: true, lastSyncedAt: sync.syncedAt, lastSyncCount: sync.count })
    }

    if (action === 'sync') {
      const { data: connection, error } = await admin.from('brightspace_connections')
        .select('feed_url_encrypted').eq('user_id', user.id).maybeSingle()
      if (error) throw error
      if (!connection?.feed_url_encrypted) throw new Error('Connect your SNHU Brightspace calendar first.')
      const feedUrl = await decryptConnectionSecret(connection.feed_url_encrypted)
      const calendarText = await fetchCalendarFeed(feedUrl)
      const sync = await saveCalendarEvents(admin, user.id, calendarText)
      return json({ success: true, connected: true, lastSyncedAt: sync.syncedAt, lastSyncCount: sync.count })
    }

    throw new Error('Unsupported Brightspace calendar action.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Brightspace calendar sync failed.'
    return json({ error: message }, 400)
  }
})
