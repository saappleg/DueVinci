import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

    const appUrl = Deno.env.get('APP_URL')!
    const localReturnUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/index\.html)?\/?$/.test(returnUrl)
    const allowLocalReturnUrls = Deno.env.get('ALLOW_LOCALHOST_RETURN_URLS') === 'true'
    if (returnUrl !== appUrl && returnUrl !== `${appUrl}/index.html` && !(allowLocalReturnUrls && localReturnUrl)) {
      throw new Error('Invalid checkout return URL')
    }
    const redirectBase = returnUrl.replace(/\/index\.html\/?$/, '').replace(/\/$/, '')

    const priceId = interval === 'monthly'
      ? Deno.env.get('STRIPE_MONTHLY_PRICE_ID')
      : Deno.env.get('STRIPE_YEARLY_PRICE_ID')
    if (!priceId) throw new Error('Subscription pricing is not configured')

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, trial_end')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileErr) throw profileErr
    if (profile?.subscription_status === 'active') throw new Error('Your subscription is already active')
    if (profile?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
        throw new Error('A subscription is already scheduled. Manage it in the billing portal.')
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
    })

    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('create-checkout-session error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
