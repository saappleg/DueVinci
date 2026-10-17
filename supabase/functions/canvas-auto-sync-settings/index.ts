import { authenticatedUser, corsHeaders, hasFeature, isSubscriptionActive, json, requireFeature } from '../_shared/canvas.ts'
import { isMockCanvasConnection } from '../_shared/mock_canvas.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST for Canvas refresh settings.' }, 405)
  try {
    const body = await req.json()
    const action = String(body?.action || 'status')
    if (action === 'status') {
      const { admin, user } = await authenticatedUser(req)
      const [{ data: profile, error: profileError }, { data: connection, error: connectionError }, { count: courseCount, error: coursesError }] = await Promise.all([
        admin.from('profiles').select('subscription_status,trial_end,subscription_plan').eq('user_id', user.id).maybeSingle(),
        admin.from('canvas_connections').select('canvas_domain,auto_sync_enabled,grade_alerts_enabled,last_auto_sync_claimed_at,last_auto_sync_error').eq('user_id', user.id).maybeSingle(),
        admin.from('courses').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('lms_provider', 'canvas'),
      ])
      if (profileError || connectionError || coursesError) throw new Error('Canvas refresh settings could not be loaded.')
      const featureEnabled = isSubscriptionActive(profile) && await hasFeature(admin, profile || {}, 'canvas_auto_sync')
      return json({
        featureEnabled,
        connected: Boolean(connection) && !isMockCanvasConnection(connection.canvas_domain || ''),
        mockConnection: Boolean(connection) && isMockCanvasConnection(connection.canvas_domain || ''),
        autoSyncEnabled: connection?.auto_sync_enabled === true,
        gradeAlertsEnabled: connection?.grade_alerts_enabled === true,
        lastAutoSyncAt: connection?.last_auto_sync_claimed_at || null,
        lastError: connection?.last_auto_sync_error || null,
        importedCourseCount: courseCount || 0,
        maxCourseCount: 100,
      })
    }
    if (action !== 'settings') throw new Error('Unsupported Canvas refresh settings action.')
    const autoSyncEnabled = body?.autoSyncEnabled === true
    const gradeAlertsEnabled = body?.gradeAlertsEnabled === true
    const { admin, user } = autoSyncEnabled || gradeAlertsEnabled
      ? await requireFeature(req, 'canvas_auto_sync')
      : await authenticatedUser(req)
    if (gradeAlertsEnabled && !autoSyncEnabled) throw new Error('Turn on automatic Canvas refresh before enabling grade alerts.')
    const { data: connection, error: connectionError } = await admin.from('canvas_connections')
      .select('user_id,canvas_domain').eq('user_id', user.id).maybeSingle()
    if (connectionError) throw new Error('Canvas connection status could not be checked.')
    if (!connection) throw new Error('Connect Canvas before changing automatic refresh settings.')
    if (autoSyncEnabled && isMockCanvasConnection(connection.canvas_domain || '')) {
      throw new Error('Automatic Canvas refresh is not available for the development demo connection.')
    }
    if (autoSyncEnabled) {
      const { count, error } = await admin.from('courses').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('lms_provider', 'canvas')
      if (error) throw new Error('Canvas course selections could not be checked.')
      if (!count) throw new Error('Select at least one Canvas course before enabling automatic refresh.')
      if (count > 100) throw new Error('Automatic Canvas refresh supports up to 100 selected courses. Reduce the selection and try again.')
    }
    const now = new Date().toISOString()
    const { error } = await admin.from('canvas_connections').update({
      auto_sync_enabled: autoSyncEnabled,
      grade_alerts_enabled: autoSyncEnabled && gradeAlertsEnabled,
      last_auto_sync_claimed_at: autoSyncEnabled ? null : now,
      last_auto_sync_error: null,
      updated_at: now,
    }).eq('user_id', user.id)
    if (error) throw new Error('Canvas refresh settings could not be saved.')
    return json({ success: true, autoSyncEnabled, gradeAlertsEnabled: autoSyncEnabled && gradeAlertsEnabled })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Canvas refresh settings failed.' }, 400)
  }
})
