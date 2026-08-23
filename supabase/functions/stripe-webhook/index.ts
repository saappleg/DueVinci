import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
})

// Maps Stripe events → DueVinci subscription_status values
const EVENT_STATUS_MAP: Record<string, string> = {
  'customer.subscription.created':      'trialing',
  'customer.subscription.updated':      'active',
  'customer.subscription.deleted':      'canceled',
  'invoice.payment_succeeded':          'active',
  'invoice.payment_failed':             'past_due',
  'customer.subscription.trial_will_end': 'trialing', // still trialing, just a warning
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
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log(`Received Stripe event: ${event.type}`)

  const newStatus = EVENT_STATUS_MAP[event.type]
  if (!newStatus) {
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

    // For subscription events, extract useful subscription metadata
    const updatePayload: Record<string, unknown> = {
      subscription_status: newStatus,
      updated_at: new Date().toISOString(),
    }

    // Capture trial_end if present
    if (dataObj.trial_end) {
      updatePayload.trial_end = new Date(dataObj.trial_end * 1000).toISOString()
    }

    const { error, count } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('stripe_customer_id', customerId)

    if (error) throw error

    console.log(`Updated profile for customer ${customerId} → status: ${newStatus} (${count} rows)`)
  } catch (err) {
    console.error('DB update failed:', err.message)
    // Still return 200 to Stripe so it doesn't retry indefinitely
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
