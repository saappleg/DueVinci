import type { adminClient } from './canvas.ts'
import type { CalendarProvider } from './calendar_oauth.ts'

type AdminClient = ReturnType<typeof adminClient>

const CLAIM_TTL_MS = 10 * 60_000

export class CalendarConnectionBusyError extends Error {
  readonly status = 409

  constructor() {
    super('A sync or disconnect for this calendar is already running. Wait a moment and try again.')
    this.name = 'CalendarConnectionBusyError'
  }
}

export async function claimCalendarConnection(
  admin: AdminClient,
  userId: string,
  provider: CalendarProvider,
  selection: string,
) {
  const claimedAt = new Date().toISOString()
  const expiredBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString()
  const { data, error } = await admin.from('calendar_connections')
    .update({ sync_claimed_at: claimedAt, updated_at: claimedAt })
    .eq('user_id', userId)
    .eq('provider', provider)
    .or(`sync_claimed_at.is.null,sync_claimed_at.lt.${expiredBefore}`)
    .select(selection)
    .maybeSingle()
  if (error) throw new Error('The calendar connection could not be claimed.')
  if (data) return { connection: data, claimedAt }

  const { data: existing, error: lookupError } = await admin.from('calendar_connections')
    .select('provider')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  if (lookupError) throw new Error('The calendar connection status could not be checked.')
  if (existing) throw new CalendarConnectionBusyError()
  return null
}

export async function releaseCalendarConnectionClaim(
  admin: AdminClient,
  userId: string,
  provider: CalendarProvider,
  claimedAt: string,
) {
  const { error } = await admin.from('calendar_connections')
    .update({ sync_claimed_at: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('sync_claimed_at', claimedAt)
  if (error) {
    console.error('Calendar connection claim could not be released.')
    return false
  }
  return true
}
