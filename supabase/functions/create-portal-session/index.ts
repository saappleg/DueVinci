import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { corsHeaders, authenticatedUser, json } from '../_shared/canvas.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

function isMissingStripeResource(error: unknown) {
  return typeof error === 'object' && error !== null
    && ((error as { code?: string }).code === 'resource_missing'
      || (error as { message?: string }).message?.startsWith('No such '))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { admin, user } = await authenticatedUser(req)
    const { returnUrl } = await req.json()
    const appUrl = Deno.env.get('APP_URL')!
    const localReturnUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/index\.html)?\/?$/.test(returnUrl)
    if (returnUrl !== appUrl && returnUrl !== `${appUrl}/index.html` && !(Deno.env.get('ALLOW_LOCALHOST_RETURN_URLS') === 'true' && localReturnUrl)) throw new Error('Invalid return URL')
    const { data: profile, error } = await admin.from('profiles').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()
    if (error) throw error
    if (!profile?.stripe_customer_id) throw new Error('No billing account was found for this user.')
    try {
      await stripe.customers.retrieve(profile.stripe_customer_id)
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error
      const { error: clearCustomerErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: null, stripe_subscription_id: null, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (clearCustomerErr) throw clearCustomerErr
      throw new Error('Your saved billing account belongs to a different Stripe environment. It was cleared; please choose a plan again.')
    }
    const session = await stripe.billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: returnUrl })
    return json({ url: session.url })
  } catch (error) { return json({ error: error.message }, 400) }
})
