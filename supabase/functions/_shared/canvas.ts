import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptCanvasToken, encryptCanvasToken } from './canvas_crypto.ts'

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

export function isSubscriptionActive(profile: { subscription_status?: string, trial_end?: string | null } | null) {
  return profile?.subscription_status === 'active'
    || (profile?.subscription_status === 'trialing' && !!profile.trial_end && new Date(profile.trial_end).getTime() > Date.now())
}

export async function hasFeature(admin: ReturnType<typeof adminClient>, profile: { subscription_plan?: string | null }, featureKey: string) {
  const { data, error } = await admin.from('subscription_plan_features')
    .select('feature_key').eq('plan_key', profile.subscription_plan || 'canvas_sync').eq('feature_key', featureKey).maybeSingle()
  if (error) throw error
  return !!data
}

export async function entitledConnection(req: Request, featureKey = 'canvas_sync') {
  const { admin, user } = await authenticatedUser(req)
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('subscription_status, trial_end, subscription_plan, canvas_domain').eq('user_id', user.id).maybeSingle()
  if (profileError) throw profileError
  if (!isSubscriptionActive(profile) || !await hasFeature(admin, profile || {}, featureKey)) throw new Error('Your plan does not include Canvas LMS Sync.')
  const { data: connection, error: connectionError } = await admin.from('canvas_connections')
    .select('canvas_domain, canvas_token, canvas_token_encrypted').eq('user_id', user.id).maybeSingle()
  if (connectionError) throw connectionError
  if (!connection) throw new Error('Canvas credentials not found. Connect Canvas first.')
  let canvasToken = connection.canvas_token_encrypted
    ? await decryptCanvasToken(connection.canvas_token_encrypted)
    : connection.canvas_token
  if (!canvasToken) throw new Error('Canvas credentials not found. Connect Canvas first.')
  // Legacy tokens are upgraded on their first use, then the plaintext copy is removed.
  if (!connection.canvas_token_encrypted) {
    const encryptedToken = await encryptCanvasToken(canvasToken)
    const { error: upgradeError } = await admin.from('canvas_connections')
      .update({ canvas_token: null, canvas_token_encrypted: encryptedToken, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
    if (upgradeError) throw upgradeError
  }
  return { admin, user, connection: { canvas_domain: connection.canvas_domain, canvas_token: canvasToken } }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
