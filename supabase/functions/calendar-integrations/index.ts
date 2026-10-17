import {
  corsHeaders,
  authenticatedUser,
  hasFeature,
  isSubscriptionActive,
  json,
  requireFeature,
  type adminClient,
} from '../_shared/canvas.ts'
import { decryptConnectionSecret, encryptConnectionSecret } from '../_shared/canvas_crypto.ts'
import {
  CalendarConnectionBusyError,
  claimCalendarConnection,
  releaseCalendarConnectionClaim,
} from '../_shared/calendar_connection_lock.ts'
import {
  classifyGoogleRevocationStatus,
  createAuthorizationUrl,
  CalendarOAuthError,
  randomBase64Url,
  refreshCalendarAccessToken,
  sha256Hex,
  type CalendarProvider,
  type OAuthTokens,
} from '../_shared/calendar_oauth.ts'
import {
  CALENDAR_SYNC_MAX_EVENTS,
  parseGoogleCalendarEvents,
  parseOutlookCalendarEvents,
  saveProviderCalendarEvents,
  type ProviderCalendarEvent,
} from '../_shared/calendar_events.ts'

type Connection = {
  provider: CalendarProvider
  access_token_encrypted: string
  refresh_token_encrypted: string
  expires_at: string
}
type CalendarStatusConnection = {
  provider: string
  last_synced_at: string | null
  last_sync_count: number | null
  last_sync_error: string | null
  needs_reconnect: boolean
}
type AdminClient = ReturnType<typeof adminClient>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function connectionFrom(value: unknown): Connection | null {
  if (!isRecord(value)
    || (value.provider !== 'google' && value.provider !== 'outlook')
    || typeof value.access_token_encrypted !== 'string'
    || typeof value.refresh_token_encrypted !== 'string'
    || typeof value.expires_at !== 'string') return null
  return {
    provider: value.provider,
    access_token_encrypted: value.access_token_encrypted,
    refresh_token_encrypted: value.refresh_token_encrypted,
    expires_at: value.expires_at,
  }
}

function isCalendarStatusConnection(value: unknown): value is CalendarStatusConnection {
  return isRecord(value)
    && typeof value.provider === 'string'
    && (value.last_synced_at === null || typeof value.last_synced_at === 'string')
    && (value.last_sync_count === null || typeof value.last_sync_count === 'number')
    && (value.last_sync_error === null || typeof value.last_sync_error === 'string')
    && typeof value.needs_reconnect === 'boolean'
}

function providerFrom(value: unknown): CalendarProvider {
  if (value === 'google' || value === 'outlook') return value
  throw new Error('Choose Google Calendar or Outlook.')
}

function calendarProviderConfigured(provider: CalendarProvider) {
  const [clientIdName, clientSecretName] = provider === 'google'
    ? ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET']
    : ['MICROSOFT_CALENDAR_CLIENT_ID', 'MICROSOFT_CALENDAR_CLIENT_SECRET']
  return Boolean(Deno.env.get(clientIdName)?.trim() && Deno.env.get(clientSecretName)?.trim())
}

function providerNotConfiguredMessage(provider: CalendarProvider) {
  return `${provider === 'google' ? 'Google Calendar' : 'Outlook'} is not configured yet. Try again later.`
}

function callbackUri() {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) throw new Error('Calendar OAuth callback is not configured.')
  const url = new URL(base)
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Calendar OAuth requires a secure Supabase project URL.')
  }
  return new URL('/functions/v1/calendar-oauth-callback', url).toString()
}

function isoFromNow(seconds: number) {
  return new Date(Date.now() + Math.min(seconds, 86_400) * 1000).toISOString()
}

function calendarWindow() {
  const start = new Date(Date.now() - 30 * 86_400_000)
  const end = new Date(Date.now() + 180 * 86_400_000)
  return { start, end }
}

async function fetchJson(url: URL, accessToken: string, provider: CalendarProvider, headers: Record<string, string> = {}) {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(12_000),
      redirect: 'error',
    })
  } catch {
    throw new Error(`${provider === 'google' ? 'Google Calendar' : 'Outlook'} could not be reached. Try syncing again shortly.`)
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('The calendar connection expired or no longer has read access. Reconnect the calendar.')
  }
  if (response.status === 429 || response.status >= 500) {
    throw new Error('The calendar provider is temporarily unavailable. Try syncing again shortly.')
  }
  if (!response.ok) throw new Error(`The calendar provider returned HTTP ${response.status}. Reconnect if this keeps happening.`)
  try {
    const payload: unknown = await response.json()
    if (!isRecord(payload)) throw new Error('not an object')
    return payload
  } catch {
    throw new Error('The calendar provider returned an unreadable response. Try syncing again.')
  }
}

async function fetchGoogleEvents(accessToken: string) {
  const { start, end } = calendarWindow()
  let nextPageToken = ''
  let total = 0
  let pageCount = 0
  const items: unknown[] = []
  do {
    pageCount += 1
    if (pageCount > 10) throw new Error('Google Calendar returned too many pages for the supported sync window.')
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('showDeleted', 'false')
    url.searchParams.set('eventTypes', 'default')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '2500')
    url.searchParams.set('timeMin', start.toISOString())
    url.searchParams.set('timeMax', end.toISOString())
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken)
    const payload = await fetchJson(url, accessToken, 'google')
    const page = payload.items
    if (!Array.isArray(page)) throw new Error('Google Calendar returned an invalid event list.')
    total += page.length
    if (total > CALENDAR_SYNC_MAX_EVENTS) throw new Error('Google Calendar has more than 5,000 events in the supported sync window. Narrow the calendar or date range and try again.')
    items.push(...page)
    nextPageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : ''
  } while (nextPageToken)
  return parseGoogleCalendarEvents(items)
}

async function fetchOutlookEvents(accessToken: string) {
  const { start, end } = calendarWindow()
  const initialUrl = new URL('https://graph.microsoft.com/v1.0/me/calendar/calendarView')
  initialUrl.searchParams.set('startDateTime', start.toISOString())
  initialUrl.searchParams.set('endDateTime', end.toISOString())
  initialUrl.searchParams.set('$select', 'id,subject,start,isCancelled')
  initialUrl.searchParams.set('$top', '1000')
  let url: URL | null = initialUrl
  let pageCount = 0
  const items: unknown[] = []
  while (url) {
    pageCount += 1
    if (pageCount > 10) throw new Error('Outlook returned too many pages for the supported sync window.')
    const payload = await fetchJson(url, accessToken, 'outlook', { Prefer: 'IdType="ImmutableId", outlook.timezone="UTC"' })
    if (!Array.isArray(payload.value)) throw new Error('Outlook returned an invalid event list.')
    items.push(...payload.value)
    if (items.length > CALENDAR_SYNC_MAX_EVENTS) throw new Error('Outlook has more than 5,000 events in the supported sync window. Narrow the calendar or date range and try again.')
    const next = typeof payload['@odata.nextLink'] === 'string' ? payload['@odata.nextLink'] : ''
    if (!next) {
      url = null
    } else {
      const nextUrl = new URL(next)
      if (nextUrl.origin !== 'https://graph.microsoft.com' || nextUrl.pathname !== '/v1.0/me/calendar/calendarView') {
        throw new Error('Outlook returned an invalid page link. Try syncing again.')
      }
      url = nextUrl
    }
  }
  return parseOutlookCalendarEvents(items)
}

async function authorizeCalendar(admin: AdminClient, userId: string, provider: CalendarProvider) {
  const state = randomBase64Url(32)
  const verifier = randomBase64Url(48)
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  await admin.from('calendar_oauth_states').delete().lt('expires_at', new Date().toISOString())
  const { error } = await admin.from('calendar_oauth_states').insert({
    state_hash: await sha256Hex(state),
    user_id: userId,
    provider,
    code_verifier_encrypted: await encryptConnectionSecret(verifier),
    expires_at: expiresAt,
  })
  if (error) throw new Error('Could not start calendar sign-in. Please try again.')
  const url = await createAuthorizationUrl(provider, callbackUri(), state, verifier)
  return { authorizationUrl: url }
}

async function tokensForSync(admin: AdminClient, userId: string, connection: Connection) {
  let accessToken = await decryptConnectionSecret(connection.access_token_encrypted)
  const refreshToken = await decryptConnectionSecret(connection.refresh_token_encrypted)
  if (Date.parse(connection.expires_at) > Date.now() + 60_000) return accessToken

  let refreshed: OAuthTokens
  try {
    refreshed = await refreshCalendarAccessToken(connection.provider, refreshToken)
  } catch (error) {
    if (error instanceof CalendarOAuthError && error.reconnectRequired) {
      await admin.from('calendar_connections').update({ needs_reconnect: true, last_sync_error: error.message, updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('provider', connection.provider)
    }
    throw error
  }
  accessToken = refreshed.access_token
  const { error } = await admin.from('calendar_connections').update({
    access_token_encrypted: await encryptConnectionSecret(accessToken),
    refresh_token_encrypted: await encryptConnectionSecret(refreshed.refresh_token || refreshToken),
    expires_at: isoFromNow(refreshed.expires_in),
    needs_reconnect: false,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', connection.provider)
  if (error) throw new Error('The calendar access token was refreshed, but DueVinci could not save it. Try again.')
  return accessToken
}

async function disconnectProvider(admin: AdminClient, userId: string, provider: CalendarProvider) {
  const sourceProvider = provider === 'google' ? 'google_calendar' : 'outlook_calendar'
  const claim = await claimCalendarConnection(admin, userId, provider, 'refresh_token_encrypted')
  const encryptedRefreshToken = isRecord(claim?.connection) && typeof claim.connection.refresh_token_encrypted === 'string'
    ? claim.connection.refresh_token_encrypted
    : ''
  let refreshToken = ''
  try {
    if (encryptedRefreshToken) refreshToken = await decryptConnectionSecret(encryptedRefreshToken)

    const { error: eventsError } = await admin.from('custom_events')
      .update({ is_active: false }).eq('user_id', userId).eq('source_provider', sourceProvider)
    if (eventsError) throw new Error('Imported calendar events could not be hidden. The connection is still saved.')

    if (claim) {
      const { error: deleteError } = await admin.from('calendar_connections')
        .delete().eq('user_id', userId).eq('provider', provider).eq('sync_claimed_at', claim.claimedAt)
      if (deleteError) throw new Error('DueVinci could not remove the saved calendar connection.')
    }
  } catch (error) {
    if (claim) await releaseCalendarConnectionClaim(admin, userId, provider, claim.claimedAt)
    throw error
  }

  let providerRevoked = provider === 'outlook' ? 'not_supported' : (refreshToken ? 'revocation_failed' : 'not_connected')
  if (provider === 'google' && refreshToken) {
    try {
      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      })
      providerRevoked = classifyGoogleRevocationStatus(response.status)
    } catch { /* Local token deletion still completes; provider revocation is reported separately. */ }
  }
  return { success: true, providerRevoked }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  if (req.method !== 'POST') return json({ error: 'Use POST for calendar integration actions.' }, 405)
  try {
    const body = await req.json()
    const action = String(body?.action || 'status')

    if (action === 'status') {
      const { admin, user } = await authenticatedUser(req)
      const [{ data: profile, error: profileError }, { data: connections, error: connectionsError }] = await Promise.all([
        admin.from('profiles').select('subscription_status,trial_end,subscription_plan').eq('user_id', user.id).maybeSingle(),
        admin.from('calendar_connections').select('provider,last_synced_at,last_sync_count,last_sync_error,needs_reconnect').eq('user_id', user.id),
      ])
      if (profileError || connectionsError) throw new Error('Calendar connection status could not be loaded.')
      const featureEnabled = isSubscriptionActive(profile) && await hasFeature(admin, profile || {}, 'calendar_sync')
      const connectionRows = (connections || []).filter(isCalendarStatusConnection)
      const byProvider = Object.fromEntries((['google', 'outlook'] as const).map((provider) => {
        const connection = connectionRows.find((item) => item.provider === provider)
        return [provider, {
          configured: calendarProviderConfigured(provider),
          connected: Boolean(connection),
          lastSyncedAt: connection?.last_synced_at || null,
          lastSyncCount: connection?.last_sync_count || 0,
          lastSyncError: connection?.last_sync_error || null,
          needsReconnect: connection?.needs_reconnect === true,
        }]
      }))
      return json({ featureEnabled, providers: byProvider })
    }

    const provider = providerFrom(body?.provider)
    if (action === 'disconnect') {
      const { admin, user } = await authenticatedUser(req)
      return json(await disconnectProvider(admin, user.id, provider))
    }

    const { admin, user } = await requireFeature(req, 'calendar_sync')
    if (action === 'authorize') {
      if (!calendarProviderConfigured(provider)) throw new Error(providerNotConfiguredMessage(provider))
      return json(await authorizeCalendar(admin, user.id, provider))
    }
    if (action !== 'sync') throw new Error('Unsupported calendar integration action.')

    const claim = await claimCalendarConnection(
      admin,
      user.id,
      provider,
      'provider,access_token_encrypted,refresh_token_encrypted,expires_at',
    )
    if (!claim) throw new Error(`Connect ${provider === 'google' ? 'Google Calendar' : 'Outlook'} first.`)
    const selectedConnection = connectionFrom(claim.connection)
    if (!selectedConnection) {
      await releaseCalendarConnectionClaim(admin, user.id, provider, claim.claimedAt)
      throw new Error('The saved calendar connection is incomplete. Reconnect this calendar.')
    }

    try {
      const accessToken = await tokensForSync(admin, user.id, selectedConnection)
      const events: ProviderCalendarEvent[] = provider === 'google'
        ? await fetchGoogleEvents(accessToken)
        : await fetchOutlookEvents(accessToken)
      const result = await saveProviderCalendarEvents(admin, user.id, provider, events, claim.claimedAt)
      return json({ success: true, connected: true, lastSyncedAt: result.syncedAt, lastSyncCount: result.count })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Calendar sync failed.'
      const needsReconnect = /expired|no longer has read access|reconnect|reauthorize|refresh token/i.test(message)
      await admin.from('calendar_connections').update({
        last_sync_error: message.slice(0, 240),
        needs_reconnect: needsReconnect,
        sync_claimed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('provider', provider).eq('sync_claimed_at', claim.claimedAt)
      throw error
    }
  } catch (error) {
    const status = error instanceof CalendarConnectionBusyError ? error.status : 400
    return json({ error: error instanceof Error ? error.message : 'Calendar integration failed.' }, status)
  }
})
