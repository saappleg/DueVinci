import { adminClient, corsHeaders, authenticatedUser, json } from '../_shared/canvas.ts'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
const stripe = stripeSecret ? new Stripe(stripeSecret, {
  apiVersion: '2025-03-31.basil',
  httpClient: Stripe.createFetchHttpClient(),
}) : null

// The browser cannot safely delete an Auth user. Keep all account cleanup here
// so a partial failure is retryable while the authenticated user still exists.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let checkoutLock: { admin: ReturnType<typeof adminClient>, userId: string, token: string } | null = null
  try {
    const { admin, user } = await authenticatedUser(req)

    // Serialize deletion with Checkout creation. Without the shared lock, a
    // session can be created or completed while account cleanup is running.
    const lockToken = crypto.randomUUID()
    const { data: lockAcquired, error: lockError } = await admin.rpc('acquire_checkout_session_lock', {
      p_user_id: user.id,
      p_lock_token: lockToken,
      p_lease_seconds: 300,
    })
    if (lockError) throw lockError
    if (lockAcquired !== true) throw new Error('Checkout is being prepared. Wait a moment and retry account deletion.')
    checkoutLock = { admin, userId: user.id, token: lockToken }

    const { error: deletionGuardError } = await admin.from('profiles')
      .upsert({ user_id: user.id, account_deletion_pending: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (deletionGuardError) throw deletionGuardError

    const { data: checkout, error: checkoutError } = await admin.from('billing_checkout_sessions')
      .select('session_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (checkoutError) throw checkoutError

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError

    if (profile?.stripe_customer_id || profile?.stripe_subscription_id || checkout?.session_id) {
      if (!stripe) throw new Error('Billing cleanup is unavailable. Please retry account deletion later.')
      let customerId = profile?.stripe_customer_id || null

      if (checkout?.session_id) {
        try {
          const session = await stripe.checkout.sessions.retrieve(checkout.session_id)
          const sessionCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
          customerId = customerId || sessionCustomerId || null
          if (session.status === 'open') {
            try { await stripe.checkout.sessions.expire(session.id) }
            catch (error) {
              if ((error as { code?: string }).code !== 'checkout_session_not_open') throw error
              // The customer completed Checkout after retrieval. Its new
              // subscription is canceled below with the customer's others.
            }
          }
        } catch (error) {
          if ((error as { code?: string }).code !== 'resource_missing') throw error
        }
      }

      if (customerId) {
        // Also expire any session left behind if Checkout creation stopped
        // after Stripe created it but before its ID was saved in Supabase.
        let sessionCursor: string | undefined
        while (true) {
          let page: { data: Stripe.Checkout.Session[], has_more: boolean }
          try {
            page = await stripe.checkout.sessions.list({
              customer: customerId,
              status: 'open',
              limit: 100,
              ...(sessionCursor ? { starting_after: sessionCursor } : {}),
            })
          } catch (error) {
            if ((error as { code?: string }).code === 'resource_missing') break
            throw error
          }
          for (const session of page.data) {
            try { await stripe.checkout.sessions.expire(session.id) }
            catch (error) {
              const code = (error as { code?: string }).code
              if (code !== 'checkout_session_not_open' && code !== 'resource_missing') throw error
            }
          }
          if (!page.has_more || page.data.length === 0) break
          sessionCursor = page.data[page.data.length - 1].id
        }
      }

      if (customerId) {
        let startingAfter: string | undefined
        while (true) {
          let page: { data: Stripe.Subscription[], has_more: boolean }
          try {
            page = await stripe.subscriptions.list({
              customer: customerId,
              status: 'all',
              limit: 100,
              ...(startingAfter ? { starting_after: startingAfter } : {}),
            })
          } catch (error) {
            if ((error as { code?: string }).code === 'resource_missing') break
            throw error
          }
          for (const subscription of page.data) {
            if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
              try { await stripe.subscriptions.cancel(subscription.id) }
              catch (error) { if ((error as { code?: string }).code !== 'resource_missing') throw error }
            }
          }
          if (!page.has_more || page.data.length === 0) break
          startingAfter = page.data[page.data.length - 1].id
        }
      } else if (profile?.stripe_subscription_id) {
        try {
          const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
          if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
            await stripe.subscriptions.cancel(subscription.id)
          }
        } catch (error) {
          if ((error as { code?: string }).code !== 'resource_missing') throw error
        }
      }
    }

    const { error: canvasError } = await admin.from('canvas_connections').delete().eq('user_id', user.id)
    if (canvasError) throw canvasError
    const { error: avatarError } = await admin.storage.from('profile-avatars').remove([`${user.id}/avatar`])
    if (avatarError && !/not found/i.test(avatarError.message || '')) throw avatarError

    // These deletes are idempotent. If a later cleanup step fails, the user can
    // retry this function and the remaining steps will run again.
    for (const table of ['support_tickets', 'app_error_events', 'assignments', 'courses', 'custom_events']) {
      const { error } = await admin.from(table).delete().eq('user_id', user.id)
      if (error) throw error
    }
    const { error: authError } = await admin.auth.admin.deleteUser(user.id)
    if (authError) throw authError
    return json({ success: true })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Account deletion failed.' }, 400) }
  finally {
    if (checkoutLock) {
      const { error } = await checkoutLock.admin.rpc('release_checkout_session_lock', {
        p_user_id: checkoutLock.userId,
        p_lock_token: checkoutLock.token,
      })
      if (error) console.error('Could not release account deletion Checkout lock:', error.message)
    }
  }
})
