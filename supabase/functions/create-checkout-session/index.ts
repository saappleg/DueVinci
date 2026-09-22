import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { approvedReturnUrls } from '../_shared/return_url.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-03-31.basil',
  httpClient: Stripe.createFetchHttpClient(),
})

function isMissingStripeResource(error: unknown) {
  return typeof error === 'object' && error !== null
    && ((error as { code?: string }).code === 'resource_missing'
      || (error as { message?: string }).message?.startsWith('No such '))
}

function shouldBlockNewCheckout(status: string | null | undefined) {
  // A customer may have a scheduled subscription even if a webhook was missed.
  // Never create a second Checkout Session (and therefore a second trial) then.
  return ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(status || '')
}

function subscriptionProfilePatch(subscription: Stripe.Subscription) {
  return {
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
    ...(subscription.metadata?.plan_key ? { subscription_plan: subscription.metadata.plan_key } : {}),
    updated_at: new Date().toISOString(),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let checkoutLock: { admin: ReturnType<typeof createClient>, userId: string, token: string } | null = null
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !user) throw new Error('Unauthorized: invalid token')

    const { interval, returnUrl } = await req.json()
    if (interval !== 'monthly' && interval !== 'yearly') throw new Error('Invalid billing interval')

    const { baseUrl: redirectBase } = approvedReturnUrls(
      returnUrl,
      Deno.env.get('APP_URL') || '',
      Deno.env.get('ALLOW_LOCALHOST_RETURN_URLS') === 'true',
    )

    const priceId = interval === 'monthly'
      ? Deno.env.get('STRIPE_MONTHLY_PRICE_ID')
      : Deno.env.get('STRIPE_YEARLY_PRICE_ID')
    if (!priceId) throw new Error('Subscription pricing is not configured')

    const lockToken = crypto.randomUUID()
    const { data: lockAcquired, error: lockError } = await supabaseAdmin.rpc('acquire_checkout_session_lock', {
      p_user_id: user.id,
      p_lock_token: lockToken,
      p_lease_seconds: 120,
    })
    if (lockError) throw lockError
    if (lockAcquired !== true) throw new Error('Checkout is already being prepared. Please wait a moment and try again.')
    checkoutLock = { admin: supabaseAdmin, userId: user.id, token: lockToken }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, trial_end')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileErr) throw profileErr
    if (profile?.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
        if (shouldBlockNewCheckout(subscription.status)) {
          throw new Error('A subscription is already scheduled. Manage it in the billing portal.')
        }
        const { error: clearEndedSubscriptionErr } = await supabaseAdmin
          .from('profiles')
          .update({ stripe_subscription_id: null, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
        if (clearEndedSubscriptionErr) throw clearEndedSubscriptionErr
      } catch (error) {
        if (!isMissingStripeResource(error)) throw error
        const { error: clearSubscriptionErr } = await supabaseAdmin
          .from('profiles')
          .update({ stripe_subscription_id: null, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
        if (clearSubscriptionErr) throw clearSubscriptionErr
      }
    }

    let customerId = profile?.stripe_customer_id
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId)
      } catch (error) {
        if (!isMissingStripeResource(error)) throw error
        customerId = undefined
        const { error: clearCustomerErr } = await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: null, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
        if (clearCustomerErr) throw clearCustomerErr
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      const { error: saveCustomerErr } = await supabaseAdmin
        .from('profiles')
        .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (saveCustomerErr) throw saveCustomerErr
    }

    // Reconcile Stripe before creating a new session. This protects against
    // duplicate trials when Checkout completed while webhook delivery failed.
    let existingSubscription: Stripe.Subscription | undefined
    let subscriptionCursor: string | undefined
    while (!existingSubscription) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
        ...(subscriptionCursor ? { starting_after: subscriptionCursor } : {}),
      })
      existingSubscription = subscriptions.data.find(subscription => shouldBlockNewCheckout(subscription.status))
      if (existingSubscription || !subscriptions.has_more || subscriptions.data.length === 0) break
      subscriptionCursor = subscriptions.data[subscriptions.data.length - 1].id
    }
    if (existingSubscription) {
      const { error: saveSubscriptionErr } = await supabaseAdmin
        .from('profiles')
        .update(subscriptionProfilePatch(existingSubscription))
        .eq('user_id', user.id)
      if (saveSubscriptionErr) throw saveSubscriptionErr
      throw new Error('A subscription is already scheduled. Manage it in the billing portal.')
    }

    if (['active', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(profile?.subscription_status || '')) {
      // Stripe has no current subscription for this customer. Repair a stale
      // webhook-derived status so checkout remains available for recovery.
      const { error: repairStatusError } = await supabaseAdmin.from('profiles')
        .update({ subscription_status: 'canceled', stripe_subscription_id: null, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (repairStatusError) throw repairStatusError
    }

    const { data: savedCheckout, error: checkoutReadError } = await supabaseAdmin
      .from('billing_checkout_sessions')
      .select('plan_interval, session_id, session_url, session_expires_at, attempt_interval, attempt_key')
      .eq('user_id', user.id)
      .maybeSingle()
    if (checkoutReadError) throw checkoutReadError

    if (savedCheckout?.session_id) {
      let openSession: Stripe.Checkout.Session | null = null
      try {
        openSession = await stripe.checkout.sessions.retrieve(savedCheckout.session_id)
      } catch (error) {
        if (!isMissingStripeResource(error)) throw error
      }
      if (openSession?.status === 'open' && openSession.expires_at * 1000 > Date.now()) {
        if (savedCheckout.plan_interval === interval && openSession.url) {
          return new Response(JSON.stringify({ url: openSession.url }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await stripe.checkout.sessions.expire(openSession.id)
      } else if (openSession?.status === 'complete' && openSession.subscription) {
        const completedSubscriptionId = typeof openSession.subscription === 'string'
          ? openSession.subscription
          : openSession.subscription.id
        try {
          const completedSubscription = await stripe.subscriptions.retrieve(completedSubscriptionId)
          if (shouldBlockNewCheckout(completedSubscription.status)) {
            const { error: completedProfileError } = await supabaseAdmin.from('profiles')
              .update(subscriptionProfilePatch(completedSubscription))
              .eq('user_id', user.id)
            if (completedProfileError) throw completedProfileError
            throw new Error('A subscription is already scheduled. Manage it in the billing portal.')
          }
        } catch (error) {
          if (!isMissingStripeResource(error)) throw error
        }
      }

      const { error: clearCheckoutError } = await supabaseAdmin
        .from('billing_checkout_sessions')
        .update({ plan_interval: null, session_id: null, session_url: null, session_expires_at: null, attempt_interval: null, attempt_key: null, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('lock_token', lockToken)
      if (clearCheckoutError) throw clearCheckoutError
      savedCheckout.attempt_interval = null
      savedCheckout.attempt_key = null
    }

    if (savedCheckout?.attempt_key && savedCheckout.attempt_interval !== interval) {
      throw new Error(`A ${savedCheckout.attempt_interval} checkout is still being recovered. Retry that option first, or contact support if it keeps failing.`)
    }

    let idempotencyKey = savedCheckout?.attempt_key || null
    if (!idempotencyKey) {
      idempotencyKey = `duevinci_checkout_${user.id}_${interval}_${crypto.randomUUID()}`
      const { data: attemptSaved, error: attemptSaveError } = await supabaseAdmin.rpc('save_checkout_attempt', {
        p_user_id: user.id,
        p_lock_token: lockToken,
        p_interval: interval,
        p_attempt_key: idempotencyKey,
      })
      if (attemptSaveError || attemptSaved !== true) {
        throw attemptSaveError || new Error('Could not safely prepare this checkout. Please try again.')
      }
    }

    const trialEnd = profile?.subscription_status === 'trialing' && profile.trial_end
      && new Date(profile.trial_end).getTime() > Date.now()
      ? Math.floor(new Date(profile.trial_end).getTime() / 1000)
      : undefined

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      payment_method_collection: 'always',
      success_url: `${redirectBase}/?canvas_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${redirectBase}/?canvas_checkout=canceled`,
      metadata: { supabase_user_id: user.id, plan_key: 'canvas_sync', plan_interval: interval },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan_key: 'canvas_sync', plan_interval: interval },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
    }, { idempotencyKey })

    if (session.status !== 'open') {
      try {
        const sessionSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        if (session.status === 'complete' && sessionSubscriptionId) {
          const completedSubscription = await stripe.subscriptions.retrieve(sessionSubscriptionId)
          if (shouldBlockNewCheckout(completedSubscription.status)) {
            await supabaseAdmin.from('profiles')
              .update(subscriptionProfilePatch(completedSubscription))
              .eq('user_id', user.id)
          }
        }
        await supabaseAdmin.from('billing_checkout_sessions')
          .update({ attempt_interval: null, attempt_key: null, updated_at: new Date().toISOString() })
          .eq('user_id', user.id).eq('lock_token', lockToken)
      } catch (reconcileError) {
        console.error('Could not reconcile a terminal checkout retry:', reconcileError.message)
      }
      throw new Error('Checkout is already complete or expired. Refresh your billing details before trying again.')
    }
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    const { data: sessionSaved, error: sessionSaveError } = await supabaseAdmin.rpc('save_checkout_session', {
      p_user_id: user.id,
      p_lock_token: lockToken,
      p_interval: interval,
      p_session_id: session.id,
      p_session_url: session.url,
      p_expires_at: new Date(session.expires_at * 1000).toISOString(),
    })
    if (sessionSaveError || sessionSaved !== true) {
      try { await stripe.checkout.sessions.expire(session.id) } catch (expireError) {
        console.error('Could not expire an unsaved checkout session:', expireError.message)
      }
      throw sessionSaveError || new Error('Could not safely save this checkout session. Please try again.')
    }
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('create-checkout-session error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } finally {
    if (checkoutLock) {
      const { error } = await checkoutLock.admin.rpc('release_checkout_session_lock', {
        p_user_id: checkoutLock.userId,
        p_lock_token: checkoutLock.token,
      })
      if (error) console.error('Could not release checkout lock:', error.message)
    }
  }
})
