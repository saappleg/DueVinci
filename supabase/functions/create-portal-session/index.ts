import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { corsHeaders, authenticatedUser, json } from '../_shared/canvas.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { admin, user } = await authenticatedUser(req)
    const { returnUrl } = await req.json()
    const appUrl = Deno.env.get('APP_URL')!
    if (returnUrl !== appUrl && returnUrl !== `${appUrl}/index.html`) throw new Error('Invalid return URL')
    const { data: profile, error } = await admin.from('profiles').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()
    if (error) throw error
    if (!profile?.stripe_customer_id) throw new Error('No billing account was found for this user.')
    const session = await stripe.billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${appUrl}/index.html` })
    return json({ url: session.url })
  } catch (error) { return json({ error: error.message }, 400) }
})
