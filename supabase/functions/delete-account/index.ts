import { corsHeaders, authenticatedUser, json } from '../_shared/canvas.ts'
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
  try {
    const { admin, user } = await authenticatedUser(req)

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError

    if (profile?.stripe_customer_id || profile?.stripe_subscription_id) {
      if (!stripe) throw new Error('Billing cleanup is unavailable. Please retry account deletion later.')
      if (profile.stripe_customer_id) {
        let startingAfter: string | undefined
        while (true) {
          let page: { data: Stripe.Subscription[], has_more: boolean }
          try {
            page = await stripe.subscriptions.list({
              customer: profile.stripe_customer_id,
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
      } else if (profile.stripe_subscription_id) {
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
  } catch (error) { return json({ error: error.message }, 400) }
})
