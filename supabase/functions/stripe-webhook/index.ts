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

serve(async (req) => {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
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
    const customerId = dataObj.customer as string

    if (!customerId) {
      console.error('No customer ID in event payload')
      return new Response(JSON.stringify({ received: true, action: 'no_customer' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (event.type === 'checkout.session.completed') {
      updatePayload.stripe_customer_id = customerId
      if (dataObj.subscription) updatePayload.stripe_subscription_id = String(dataObj.subscription)
      if (dataObj.metadata?.plan_key) updatePayload.subscription_plan = dataObj.metadata.plan_key
    } else if (event.type.startsWith('customer.subscription.')) {
      updatePayload.subscription_status = dataObj.status
      updatePayload.stripe_subscription_id = dataObj.id
      if (dataObj.metadata?.plan_key) updatePayload.subscription_plan = dataObj.metadata.plan_key
    } else if (event.type === 'invoice.payment_succeeded') {
      updatePayload.subscription_status = 'active'
    } else if (event.type === 'invoice.payment_failed') {
      updatePayload.subscription_status = 'past_due'
    }

    // Capture trial_end if present
    if (dataObj.trial_end) {
      updatePayload.trial_end = new Date(dataObj.trial_end * 1000).toISOString()
    }

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('stripe_customer_id', customerId)

    if (error) throw error

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
