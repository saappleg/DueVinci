import { authenticatedUser, hasFeature, isSubscriptionActive, json } from '../_shared/canvas.ts'

const FEATURE_KEYS = ['canvas_sync', 'socratic_tutor', 'daily_brief']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  } })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const { admin, user } = await authenticatedUser(req)
    const { data: profile, error } = await admin.from('profiles')
      .select('subscription_status, subscription_plan, trial_end, trial_started_at, stripe_customer_id, stripe_subscription_id, subscription_current_period_end, subscription_cancel_at, subscription_cancel_at_period_end, canvas_domain, canvas_last_synced_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error

    const active = isSubscriptionActive(profile)
    const planKey = profile?.subscription_plan || 'canvas_sync'
    const features: Record<string, boolean> = {}
    await Promise.all(FEATURE_KEYS.map(async (featureKey) => {
      features[featureKey] = active && await hasFeature(admin, { subscription_plan: planKey }, featureKey)
    }))

    return json({
      status: profile?.subscription_status || 'inactive',
      plan: planKey,
      trialEnd: profile?.trial_end || null,
      trialStartedAt: profile?.trial_started_at || null,
      hasBillingAccount: Boolean(profile?.stripe_customer_id),
      hasScheduledSubscription: Boolean(profile?.stripe_subscription_id),
      currentPeriodEnd: profile?.subscription_current_period_end || null,
      cancelAt: profile?.subscription_cancel_at || null,
      cancelAtPeriodEnd: Boolean(profile?.subscription_cancel_at_period_end),
      canvasDomain: profile?.canvas_domain || null,
      canvasLastSyncedAt: profile?.canvas_last_synced_at || null,
      features,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load subscription status.'
    return json({ error: message }, 400)
  }
})
