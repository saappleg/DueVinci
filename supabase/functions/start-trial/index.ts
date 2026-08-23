import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Check they don't already have an active/trialing subscription
    const { data: existing, error: profileLookupErr } = await supabaseAdmin
        .from('profiles')
        .select('subscription_status, trial_started_at, trial_end')
        .eq('user_id', user.id)
        .maybeSingle()

    if (profileLookupErr) throw profileLookupErr

    const hasActiveTrial = existing?.subscription_status === 'trialing'
      && existing.trial_end
      && new Date(existing.trial_end).getTime() > Date.now()

    if (hasActiveTrial || existing?.subscription_status === 'active') {
      return new Response(
        JSON.stringify({ success: true, message: 'Already on a plan', status: existing.subscription_status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (existing?.trial_started_at) {
      return new Response(
        JSON.stringify({ success: false, code: 'trial_used', error: 'Your free trial has already been used. Please choose a Canvas Sync plan.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Set 30-day trial from now
    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + 30)

    // New accounts may not have a profile row yet. update() succeeds even when it
    // changes zero rows, which left the client waiting in its trial-loading state.
    const { data: profile, error: upsertErr } = await supabaseAdmin
        .from('profiles')
        .upsert({
            user_id: user.id,
            subscription_status: 'trialing',
            subscription_plan: 'canvas_sync',
            trial_started_at: new Date().toISOString(),
            trial_end: trialEnd.toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select('subscription_status, trial_end')
        .single()

    if (upsertErr) throw upsertErr
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
