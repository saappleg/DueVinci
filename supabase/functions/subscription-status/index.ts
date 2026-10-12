import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { authenticatedUser, hasFeature, isSubscriptionActive, json } from '../_shared/canvas.ts'

const FEATURE_KEYS = ['canvas_sync', 'socratic_tutor', 'daily_brief']
const PROFILE_FIELDS = 'subscription_status, subscription_plan, trial_end, trial_started_at, stripe_customer_id, stripe_subscription_id, subscription_current_period_end, subscription_cancel_at, subscription_cancel_at_period_end, canvas_domain, canvas_last_synced_at, updated_at'

function stripeId(value: any): string | null {
  if (typeof value === 'string') return value
  return typeof value?.id === 'string' ? value.id : null
}

function subscriptionPayload(subscription: Stripe.Subscription, previousPlan: string | null) {
  return {
    stripe_customer_id: stripeId(subscription.customer),
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    subscription_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    subscription_cancel_at: subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    subscription_plan: subscription.metadata?.plan_key || previousPlan || 'canvas_sync',
    updated_at: new Date().toISOString(),
  }
}

function statusPriority(status: string) {
  return ({
    active: 7,
    trialing: 6,
    past_due: 5,
    unpaid: 4,
    paused: 3,
    incomplete: 2,
    canceled: 1,
    incomplete_expired: 0,
  } as Record<string, number>)[status] ?? -1
}

async function listCustomerSubscriptions(stripe: Stripe, customerId: string) {
  const subscriptions: Stripe.Subscription[] = []
  let startingAfter: string | undefined
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    subscriptions.push(...page.data)
    if (!page.has_more) return subscriptions
    startingAfter = page.data.at(-1)?.id
    if (!startingAfter) return subscriptions
  }
  throw new Error('Too many subscriptions to reconcile in one request.')
}

async function saveReconciledProfile(admin: any, profile: any, userId: string, update: Record<string, unknown>) {
  let query = admin.from('profiles').update(update).eq('user_id', userId)
  if (profile.updated_at) query = query.eq('updated_at', profile.updated_at)
  else query = query.is('updated_at', null)
  const { data, error } = await query.select(PROFILE_FIELDS).maybeSingle()
  if (error) throw error
  if (data) return data
  const { data: latestProfile, error: latestError } = await admin.from('profiles')
    .select(PROFILE_FIELDS).eq('user_id', userId).maybeSingle()
  if (latestError) throw latestError
  return latestProfile || profile
}

async function reconcileWithStripe(admin: any, profile: any, userId: string) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!profile?.stripe_customer_id && !profile?.stripe_subscription_id) {
    const validLocalTrial = profile?.subscription_status === 'trialing'
      && profile.trial_end && new Date(profile.trial_end).getTime() > Date.now()
    if (validLocalTrial) return { profile, warning: false }
    if (!['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(profile?.subscription_status || '')) {
      return { profile, warning: false }
    }
    const repaired = await saveReconciledProfile(admin, profile, userId, {
      subscription_status: 'inactive',
      stripe_subscription_id: null,
      subscription_current_period_end: null,
      subscription_cancel_at_period_end: false,
      subscription_cancel_at: null,
      updated_at: new Date().toISOString(),
    })
    return { profile: repaired, warning: false }
  }
  if (!secretKey) return { profile, warning: true }

  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-03-31.basil',
    httpClient: Stripe.createFetchHttpClient(),
  })
  const subscriptions = new Map<string, Stripe.Subscription>()
  let customerMissing = false

  if (profile.stripe_subscription_id) {
    try {
      const current = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
      if (profile.stripe_customer_id && stripeId(current.customer) !== profile.stripe_customer_id) {
        throw new Error('The saved subscription does not belong to this billing customer.')
      }
      subscriptions.set(current.id, current)
    } catch (error) {
      if ((error as any)?.code !== 'resource_missing') throw error
    }
  }

  if (profile.stripe_customer_id) {
    try {
      const customerSubscriptions = await listCustomerSubscriptions(stripe, profile.stripe_customer_id)
      customerSubscriptions.forEach((subscription) => subscriptions.set(subscription.id, subscription))
    } catch (error) {
      if ((error as any)?.code !== 'resource_missing') throw error
      customerMissing = true
    }
  }

  if (subscriptions.size === 0) {
    const validLocalTrial = profile.subscription_status === 'trialing'
      && profile.trial_end && new Date(profile.trial_end).getTime() > Date.now()
    if (validLocalTrial) return { profile, warning: false }
    const repaired = await saveReconciledProfile(admin, profile, userId, {
      ...(customerMissing ? { stripe_customer_id: null } : {}),
      stripe_subscription_id: null,
      subscription_status: profile.subscription_status === 'inactive' ? 'inactive' : 'canceled',
      subscription_current_period_end: null,
      subscription_cancel_at_period_end: false,
      subscription_cancel_at: null,
      updated_at: new Date().toISOString(),
    })
    return { profile: repaired, warning: false }
  }
  const candidates = [...subscriptions.values()].sort((a, b) =>
    statusPriority(b.status) - statusPriority(a.status)
      || Number(b.id === profile.stripe_subscription_id) - Number(a.id === profile.stripe_subscription_id)
      || b.created - a.created,
  )
  const current = candidates[0]

  // A local free trial can exist without a Stripe subscription. Keep that
  // entitlement when Stripe only has an old canceled subscription on file.
  if (current.status === 'canceled' && profile.subscription_status === 'trialing'
      && profile.trial_end && new Date(profile.trial_end).getTime() > Date.now()) {
    return { profile, warning: false }
  }

  const update = subscriptionPayload(current, profile.subscription_plan)
  const changed = Object.entries(update).some(([key, value]) => key !== 'updated_at' && profile[key] !== value)
  if (!changed) return { profile, warning: false }

  return { profile: await saveReconciledProfile(admin, profile, userId, update), warning: false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  } })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const { admin, user } = await authenticatedUser(req)
    const { data: initialProfile, error } = await admin.from('profiles')
      .select(PROFILE_FIELDS)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error

    let profile = initialProfile
    let reconciliationWarning = false
    if (req.method === 'POST') {
      let body: any = {}
      try { body = await req.json() } catch { /* An empty POST is a regular status refresh. */ }
      if (body?.reconcile === true && profile) {
        try {
          ({ profile, warning: reconciliationWarning } = await reconcileWithStripe(admin, profile, user.id))
        } catch (reconciliationError) {
          reconciliationWarning = true
          const message = reconciliationError instanceof Error ? reconciliationError.message : 'Unknown Stripe refresh error.'
          console.error(`Stripe status refresh failed for user ${user.id}:`, message)
        }
      }
    }

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
      billingRefreshWarning: reconciliationWarning,
      features,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load subscription status.'
    return json({ error: message }, 400)
  }
})
