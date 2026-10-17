import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const SUPPORTED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
])

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function stripeId(value: any): string | null {
  if (typeof value === 'string') return value
  return typeof value?.id === 'string' ? value.id : null
}

function invoiceSubscriptionId(invoice: any): string | null {
  return stripeId(invoice.subscription)
    || stripeId(invoice.parent?.subscription_details?.subscription)
}

function keepsSubscriptionSlot(status: string | null | undefined) {
  return ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(status || '')
}

function subscriptionPayload(subscription: Stripe.Subscription) {
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
  if (!webhookSecret || !stripeSecret) {
    console.error('Stripe webhook credentials are not configured.')
    return json({ error: 'Webhook is not configured.' }, 500)
  }
  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2025-03-31.basil',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 })

  let event: Stripe.Event
  try {
    // Supabase Edge Functions use Deno's Web Crypto provider, which validates
    // webhook signatures asynchronously.
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Stripe signature.'
    console.error('Webhook signature verification failed:', message)
    return new Response(`Webhook Error: ${message}`, { status: 400 })
  }

  console.log(`Received Stripe event ${event.id}: ${event.type}`)
  if (!SUPPORTED_EVENTS.has(event.type)) {
    return json({ received: true, action: 'ignored' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const lockToken = crypto.randomUUID()
  let eventLockAcquired = false

  const acknowledge = async (action: string) => {
    const { data, error } = await supabase.rpc('mark_stripe_event_processed', {
      p_event_id: event.id,
      p_lock_token: lockToken,
    })
    if (error) throw error
    if (!data) throw new Error('Stripe event lock was lost before acknowledgment.')
    eventLockAcquired = false
    return json({ received: true, action })
  }

  try {
    const { data: acquired, error: lockError } = await supabase.rpc('acquire_stripe_event_lock', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_lock_token: lockToken,
      p_lease_seconds: 180,
    })
    if (lockError) throw lockError
    if (!acquired) {
      const { data: previous, error: previousError } = await supabase
        .from('billing_stripe_events').select('processed_at').eq('event_id', event.id).maybeSingle()
      if (previousError) throw previousError
      if (previous?.processed_at) return json({ received: true, action: 'duplicate' })
      return json({ error: 'This event is already being processed. Stripe should retry it.' }, 503, { 'Retry-After': '5' })
    }
    eventLockAcquired = true

    const dataObj = event.data.object as any
    const customerId = stripeId(dataObj.customer)
    if (!customerId) {
      console.error(`Stripe event ${event.id} has no customer ID.`)
      return await acknowledge('no_customer')
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, updated_at, account_deletion_pending')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile || profile.account_deletion_pending) {
      const orphanSubscriptionId = event.type === 'checkout.session.completed'
        ? stripeId(dataObj.subscription)
        : event.type.startsWith('customer.subscription.')
          ? stripeId(dataObj.id)
          : event.type.startsWith('invoice.payment_')
            ? invoiceSubscriptionId(dataObj)
            : null
      if (!orphanSubscriptionId) return await acknowledge(profile ? 'deletion_pending_no_subscription' : 'profile_not_found')
      try {
        const orphanSubscription = await stripe.subscriptions.retrieve(orphanSubscriptionId)
        if (stripeId(orphanSubscription.customer) !== customerId) throw new Error('Orphan subscription customer mismatch')
        if (!['canceled', 'incomplete_expired'].includes(orphanSubscription.status)) {
          await stripe.subscriptions.cancel(orphanSubscription.id)
        }
        return await acknowledge('orphan_subscription_canceled')
      } catch (error) {
        if ((error as { code?: string }).code === 'resource_missing') {
          return await acknowledge('orphan_subscription_missing')
        }
        throw error
      }
    }

    let updatePayload: Record<string, unknown> | null = null
    let expectedSubscriptionId: string | null | undefined
    if (event.type === 'checkout.session.completed') {
      const subscriptionId = stripeId(dataObj.subscription)
      if (!subscriptionId) {
        updatePayload = {
          stripe_customer_id: customerId,
          ...(dataObj.metadata?.plan_key ? { subscription_plan: dataObj.metadata.plan_key } : {}),
          updated_at: new Date().toISOString(),
        }
      } else {
        const incoming = await stripe.subscriptions.retrieve(subscriptionId)
        if (stripeId(incoming.customer) !== customerId) throw new Error('Checkout subscription customer mismatch')
        let current: Stripe.Subscription | null = null
        if (profile.stripe_subscription_id && profile.stripe_subscription_id !== incoming.id) {
          try { current = await stripe.subscriptions.retrieve(profile.stripe_subscription_id) }
          catch (error) { if ((error as any)?.code !== 'resource_missing') throw error }
        }
        if (!current || !keepsSubscriptionSlot(current.status)) {
          updatePayload = { ...subscriptionPayload(incoming), stripe_customer_id: customerId }
          expectedSubscriptionId = profile.stripe_subscription_id || null
        }
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      const incomingId = stripeId(dataObj.id)
      if (!incomingId) throw new Error('Subscription event is missing its subscription ID')
      const incoming = await stripe.subscriptions.retrieve(incomingId)
      if (stripeId(incoming.customer) !== customerId) throw new Error('Subscription customer mismatch')

      let current: Stripe.Subscription | null = null
      if (profile.stripe_subscription_id && profile.stripe_subscription_id !== incoming.id) {
        try { current = await stripe.subscriptions.retrieve(profile.stripe_subscription_id) }
        catch (error) { if ((error as any)?.code !== 'resource_missing') throw error }
      }
      if (!current || !keepsSubscriptionSlot(current.status)) {
        updatePayload = { ...subscriptionPayload(incoming), stripe_customer_id: customerId }
        expectedSubscriptionId = profile.stripe_subscription_id || null
      }
    } else if (event.type.startsWith('invoice.payment_')) {
      const invoiceSubId = invoiceSubscriptionId(dataObj)
      // One-off invoices and events for old subscriptions never change access.
      if (!invoiceSubId || invoiceSubId !== profile.stripe_subscription_id) {
        return await acknowledge('unlinked_invoice_ignored')
      }
      const subscription = await stripe.subscriptions.retrieve(invoiceSubId)
      if (stripeId(subscription.customer) !== customerId) throw new Error('Invoice subscription customer mismatch')
      updatePayload = subscriptionPayload(subscription)
      expectedSubscriptionId = profile.stripe_subscription_id
    }

    if (!updatePayload) return await acknowledge('stale_event_ignored')

    let guardedUpdate = supabase.from('profiles').update(updatePayload).eq('stripe_customer_id', customerId)
    if (expectedSubscriptionId === null) guardedUpdate = guardedUpdate.is('stripe_subscription_id', null)
    else if (expectedSubscriptionId) guardedUpdate = guardedUpdate.eq('stripe_subscription_id', expectedSubscriptionId)
    if (profile.updated_at) guardedUpdate = guardedUpdate.eq('updated_at', profile.updated_at)
    else guardedUpdate = guardedUpdate.is('updated_at', null)
    const { data: updatedProfiles, error } = await guardedUpdate.select('user_id')
    if (error) throw error
    if (!updatedProfiles?.length) throw new Error('A concurrent billing update changed the profile. Stripe should retry this event.')

    console.log(`Updated profile for customer ${customerId} from ${event.type}`)
    return await acknowledge('processed')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error.'
    console.error(`Stripe event ${event.id} processing failed:`, message)
    if (eventLockAcquired) {
      const { error: releaseError } = await supabase.rpc('release_stripe_event_lock', {
        p_event_id: event.id,
        p_lock_token: lockToken,
      })
      if (releaseError) console.error(`Could not release lock for Stripe event ${event.id}:`, releaseError.message)
    }
    return json({ error: 'Subscription update failed. Stripe should retry this event.' }, 500)
  }
})
