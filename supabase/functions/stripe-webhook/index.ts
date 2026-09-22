import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-03-31.basil',
  httpClient: Stripe.createFetchHttpClient(),
})

const SUPPORTED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
])

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

serve(async (req) => {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  let event: Stripe.Event
  try {
    // Supabase Edge Functions use Deno's Web Crypto provider, which validates
    // webhook signatures asynchronously.
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log(`Received Stripe event: ${event.type}`)

  if (!SUPPORTED_EVENTS.has(event.type)) {
    // Event not relevant to us — acknowledge and ignore
    return new Response(JSON.stringify({ received: true, action: 'ignored' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const dataObj = event.data.object as any
    const customerId = stripeId(dataObj.customer)

    if (!customerId) {
      console.error('No customer ID in event payload')
      return new Response(JSON.stringify({ received: true, action: 'no_customer' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) {
      return new Response(JSON.stringify({ received: true, action: 'profile_not_found' }), {
        headers: { 'Content-Type': 'application/json' },
      })
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
        return new Response(JSON.stringify({ received: true, action: 'unlinked_invoice_ignored' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const subscription = await stripe.subscriptions.retrieve(invoiceSubId)
      if (stripeId(subscription.customer) !== customerId) throw new Error('Invoice subscription customer mismatch')
      updatePayload = subscriptionPayload(subscription)
      expectedSubscriptionId = profile.stripe_subscription_id
    }

    if (!updatePayload) {
      return new Response(JSON.stringify({ received: true, action: 'stale_event_ignored' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let guardedUpdate = supabase.from('profiles').update(updatePayload).eq('stripe_customer_id', customerId)
    if (expectedSubscriptionId === null) guardedUpdate = guardedUpdate.is('stripe_subscription_id', null)
    else if (expectedSubscriptionId) guardedUpdate = guardedUpdate.eq('stripe_subscription_id', expectedSubscriptionId)
    const { data: updatedProfiles, error } = await guardedUpdate.select('user_id')
    if (error) throw error
    if (!updatedProfiles?.length) {
      return new Response(JSON.stringify({ received: true, action: 'concurrent_update_ignored' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`Updated profile for customer ${customerId} from ${event.type}`)
  } catch (err) {
    console.error('DB update failed:', err.message)
    return new Response(JSON.stringify({ error: 'Database update failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
