import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isMissingStripeResource(error: unknown) {
  return typeof error === 'object' && error !== null
    && ((error as { code?: string }).code === 'resource_missing'
      || (error as { message?: string }).message?.startsWith('No such '))
}

function blocksTrial(status: string | null | undefined) {
  return ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(status || '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get the authenticated user from the JWT in the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !user) throw new Error('Unauthorized: invalid token')

    // The Auth trigger normally creates this row. Keep the endpoint robust for
    // older accounts where that row is missing.
    const { error: ensureProfileErr } = await supabaseAdmin.from('profiles')
      .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
    if (ensureProfileErr) throw ensureProfileErr

    const { data: existing, error: profileLookupErr } = await supabaseAdmin
        .from('profiles')
        .select('subscription_status, trial_started_at, trial_end, stripe_customer_id, stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (profileLookupErr) throw profileLookupErr

    const hasActiveTrial = existing?.subscription_status === 'trialing'
      && existing.trial_end
      && new Date(existing.trial_end).getTime() > Date.now()

    if (hasActiveTrial && !existing?.stripe_customer_id && !existing?.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ success: true, message: 'Already on a plan', status: existing.subscription_status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Reconcile Stripe before changing local entitlement state. A webhook may
    // still be in flight after a checkout or a failed payment.
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
    if (existing?.stripe_customer_id || existing?.stripe_subscription_id) {
      if (!stripeSecret) throw new Error('Billing could not be verified. Please choose a plan or contact support.')
      const stripe = new Stripe(stripeSecret, {
        apiVersion: '2025-03-31.basil',
        httpClient: Stripe.createFetchHttpClient(),
      })

      let customerExists = true
      if (existing.stripe_customer_id) {
        try {
          await stripe.customers.retrieve(existing.stripe_customer_id)
        } catch (error) {
          if (!isMissingStripeResource(error)) throw error
          customerExists = false
        }

        if (customerExists) {
          const subscriptions = await stripe.subscriptions.list({ customer: existing.stripe_customer_id, status: 'all', limit: 100 })
          const current = subscriptions.data.find((subscription) => blocksTrial(subscription.status))
          if (current) {
            const { error: reconcileError } = await supabaseAdmin.from('profiles').update({
              stripe_subscription_id: current.id,
              subscription_status: current.status,
              ...(current.trial_end ? { trial_end: new Date(current.trial_end * 1000).toISOString() } : {}),
              updated_at: new Date().toISOString(),
            }).eq('user_id', user.id)
            if (reconcileError) throw reconcileError
            if (current.status === 'active' || current.status === 'trialing') {
              return new Response(
                JSON.stringify({ success: true, message: 'Already on a plan', status: current.status }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
            return new Response(
              JSON.stringify({ success: false, code: 'subscription_exists', error: 'An existing Stripe subscription was found. Manage it from your billing portal.' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
      } else if (existing.stripe_subscription_id) {
        try {
          const current = await stripe.subscriptions.retrieve(existing.stripe_subscription_id)
          if (blocksTrial(current.status)) {
            const { error: reconcileError } = await supabaseAdmin.from('profiles').update({
              stripe_subscription_id: current.id,
              subscription_status: current.status,
              ...(current.trial_end ? { trial_end: new Date(current.trial_end * 1000).toISOString() } : {}),
              updated_at: new Date().toISOString(),
            }).eq('user_id', user.id)
            if (reconcileError) throw reconcileError
            if (current.status === 'active' || current.status === 'trialing') {
              return new Response(
                JSON.stringify({ success: true, message: 'Already on a plan', status: current.status }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
            return new Response(
              JSON.stringify({ success: false, code: 'subscription_exists', error: 'An existing Stripe subscription was found. Manage it from your billing portal.' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } catch (error) {
          if (!isMissingStripeResource(error)) throw error
        }
      }

      const { error: clearEndedSubscriptionErr } = await supabaseAdmin.from('profiles')
        .update({
          stripe_subscription_id: null,
          ...(!customerExists ? { stripe_customer_id: null } : {}),
          ...(existing?.subscription_status && existing.subscription_status !== 'inactive'
            ? { subscription_status: 'canceled' }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
      if (clearEndedSubscriptionErr) throw clearEndedSubscriptionErr
    } else if (existing?.subscription_status && existing.subscription_status !== 'inactive' && existing.subscription_status !== 'canceled') {
      // A non-inactive status without any Stripe identifiers cannot represent
      // a live billing subscription. Fail closed and allow the normal trial
      // eligibility check to decide whether a new trial can be used.
      const { error: clearStaleStatusErr } = await supabaseAdmin.from('profiles')
        .update({ subscription_status: 'canceled', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (clearStaleStatusErr) throw clearStaleStatusErr
    }

    if (existing?.trial_started_at) {
      return new Response(
        JSON.stringify({ success: false, code: 'trial_used', error: 'Your free trial has already been used. Please choose a subscription.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Set a one-time 30-day trial with a compare-and-set update so concurrent
    // requests cannot both pass the unused-trial check.
    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + 30)

    const { data: profile, error: upsertErr } = await supabaseAdmin
        .from('profiles')
        .update({
            user_id: user.id,
            subscription_status: 'trialing',
            subscription_plan: 'canvas_sync',
            trial_started_at: new Date().toISOString(),
            trial_end: trialEnd.toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .is('trial_started_at', null)
        .is('stripe_subscription_id', null)
        .in('subscription_status', ['inactive', 'canceled'])
        .select('subscription_status, trial_end')
        .maybeSingle()

    if (upsertErr) throw upsertErr
    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, code: 'trial_used', error: 'Your account is not eligible for another free trial. Please choose a subscription.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (profile.subscription_status !== 'trialing') throw new Error('Trial status was not saved.')

    return new Response(
      JSON.stringify({ success: true, trial_end: trialEnd.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('start-trial error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
