import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

export async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) throw new Error('Missing Authorization header')
  const admin = adminClient()
  const { data: { user }, error } = await admin.auth.getUser(authorization.replace('Bearer ', ''))
  if (error || !user) throw new Error('Unauthorized')
  return { admin, user }
}

export function normalizeCanvasDomain(raw: unknown) {
  const value = String(raw || '').trim()
  const url = new URL(value.startsWith('http') ? value : `https://${value}`)
  if (url.protocol !== 'https:' || !url.hostname || url.hostname === 'localhost' || /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname)) {
    throw new Error('Use a public HTTPS Canvas URL.')
  }
  return url.origin
}

export function isEntitled(profile: { subscription_status?: string, trial_end?: string | null } | null) {
  return profile?.subscription_status === 'active'
    || (profile?.subscription_status === 'trialing' && !!profile.trial_end && new Date(profile.trial_end).getTime() > Date.now())
}

export async function entitledConnection(req: Request) {
  const { admin, user } = await authenticatedUser(req)
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('subscription_status, trial_end, canvas_domain').eq('user_id', user.id).maybeSingle()
  if (profileError) throw profileError
  if (!isEntitled(profile)) throw new Error('Canvas LMS Sync requires an active plan or unexpired trial.')
  const { data: connection, error: connectionError } = await admin.from('canvas_connections')
    .select('canvas_domain, canvas_token').eq('user_id', user.id).maybeSingle()
  if (connectionError) throw connectionError
  if (!connection) throw new Error('Canvas credentials not found. Connect Canvas first.')
  return { admin, user, connection }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
