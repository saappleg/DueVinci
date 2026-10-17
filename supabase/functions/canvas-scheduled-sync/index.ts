import { adminClient, corsHeaders, hasFeature, isSubscriptionActive, json } from '../_shared/canvas.ts'
import { constantTimeSecretMatches } from '../_shared/calendar_oauth.ts'
import { runScheduledCanvasSync, type ScheduledCanvasConnection } from '../_shared/canvas_scheduled_sync.ts'

const MAX_ACCOUNTS_PER_RUN = 1
const MINIMUM_SYNC_INTERVAL_MS = 55 * 60_000

function connectionFrom(value: unknown): ScheduledCanvasConnection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.user_id !== 'string' || typeof row.canvas_domain !== 'string'
    || (row.canvas_token !== null && typeof row.canvas_token !== 'string')
    || (row.canvas_token_encrypted !== null && typeof row.canvas_token_encrypted !== 'string')
    || (row.last_synced_at !== null && typeof row.last_synced_at !== 'string')
    || (row.last_auto_sync_claimed_at !== null && typeof row.last_auto_sync_claimed_at !== 'string')
    || typeof row.auto_sync_enabled !== 'boolean' || typeof row.grade_alerts_enabled !== 'boolean') return null
  return {
    user_id: row.user_id,
    canvas_domain: row.canvas_domain,
    canvas_token: row.canvas_token,
    canvas_token_encrypted: row.canvas_token_encrypted,
    last_synced_at: row.last_synced_at,
    last_auto_sync_claimed_at: row.last_auto_sync_claimed_at,
    auto_sync_enabled: row.auto_sync_enabled,
    grade_alerts_enabled: row.grade_alerts_enabled,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST for scheduled Canvas refresh.' }, 405)

  const expectedSecret = Deno.env.get('CANVAS_SCHEDULER_SECRET') || ''
  const actualSecret = req.headers.get('x-duevinci-cron-secret') || ''
  if (!await constantTimeSecretMatches(actualSecret, expectedSecret)) return json({ error: 'Unauthorized scheduler request.' }, 401)

  const admin = adminClient()
  const now = new Date().toISOString()
  const cutoff = new Date(Date.now() - MINIMUM_SYNC_INTERVAL_MS).toISOString()
  const { data: connections, error } = await admin.from('canvas_connections')
    .select('user_id,canvas_domain,canvas_token,canvas_token_encrypted,last_synced_at,auto_sync_enabled,grade_alerts_enabled,last_auto_sync_claimed_at')
    .eq('auto_sync_enabled', true)
    .or(`last_auto_sync_claimed_at.is.null,last_auto_sync_claimed_at.lt.${cutoff}`)
    .order('last_auto_sync_claimed_at', { ascending: true, nullsFirst: true })
    .limit(MAX_ACCOUNTS_PER_RUN)
  if (error) {
    console.error('Canvas scheduled refresh could not load eligible connections.')
    return json({ error: 'Scheduled Canvas refresh could not start.' }, 500)
  }

  let synced = 0
  let skipped = 0
  const connectionRows = Array.isArray(connections) ? connections : []
  const parsedConnections = connectionRows.map(connectionFrom).filter((row): row is ScheduledCanvasConnection => row !== null)
  let failed = connectionRows.length - parsedConnections.length
  for (const connection of parsedConnections) {
    // Claim before checking entitlement so one account with a broken profile
    // lookup cannot be selected on every minute and starve the queue.
    const { data: claimed, error: claimError } = await admin.from('canvas_connections')
      .update({ last_auto_sync_claimed_at: now, updated_at: now })
      .eq('user_id', connection.user_id)
      .eq('auto_sync_enabled', true)
      .or(`last_auto_sync_claimed_at.is.null,last_auto_sync_claimed_at.lt.${cutoff}`)
      .select('user_id')
      .maybeSingle()
    if (claimError) {
      failed += 1
      continue
    }
    if (!claimed) {
      skipped += 1
      continue
    }

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('subscription_status,trial_end,subscription_plan').eq('user_id', connection.user_id).maybeSingle()
    if (profileError) {
      const { error: statusError } = await admin.from('canvas_connections').update({
        last_auto_sync_error: 'Pro entitlement could not be checked. The scheduled refresh will try again later.',
        updated_at: new Date().toISOString(),
      }).eq('user_id', connection.user_id)
      if (statusError) console.warn('Canvas entitlement lookup failure could not be saved.')
      failed += 1
      continue
    }
    let entitled = false
    try {
      entitled = isSubscriptionActive(profile) && await hasFeature(admin, profile || {}, 'canvas_auto_sync')
    } catch {
      failed += 1
      console.warn('Canvas scheduled refresh could not verify one account entitlement.')
      const { error: statusError } = await admin.from('canvas_connections').update({
        last_auto_sync_error: 'Pro entitlement could not be checked. The scheduled refresh will try again later.',
        updated_at: new Date().toISOString(),
      }).eq('user_id', connection.user_id)
      if (statusError) console.warn('Canvas entitlement lookup failure could not be saved.')
      continue
    }
    if (!entitled) {
      await admin.from('canvas_connections').update({
        auto_sync_enabled: false,
        grade_alerts_enabled: false,
        last_auto_sync_error: 'An active DueVinci Pro plan is required for scheduled Canvas refresh.',
        updated_at: now,
      }).eq('user_id', connection.user_id)
      skipped += 1
      continue
    }

    try {
      await runScheduledCanvasSync(admin, { ...connection, last_synced_at: connection.last_synced_at || null }, profile || {}, now)
      synced += 1
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : 'Canvas scheduled refresh failed.'
      console.warn('Canvas scheduled refresh failed:', safeMessage)
      const { error: saveError } = await admin.from('canvas_connections').update({
        last_auto_sync_error: safeMessage.slice(0, 240),
        updated_at: new Date().toISOString(),
      }).eq('user_id', connection.user_id)
      if (saveError) console.warn('Canvas scheduled refresh error status could not be saved.')
      failed += 1
    }
  }

  return json({ success: true, processed: synced + failed + skipped, synced, failed, skipped, limit: MAX_ACCOUNTS_PER_RUN })
})
