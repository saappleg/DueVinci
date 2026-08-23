import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const text = (value: unknown, max: number) => String(value || '').trim().slice(0, max)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const message = text(body.message, 1000)
    if (!message) throw new Error('Missing error message')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authorization = req.headers.get('Authorization')
    let userId: string | null = null
    if (authorization) {
      const { data } = await admin.auth.getUser(authorization.replace('Bearer ', ''))
      userId = data.user?.id || null
    }
    const { error } = await admin.from('app_error_events').insert({
      user_id: userId,
      source: text(body.source, 120) || 'browser',
      message,
      stack: text(body.stack, 8000) || null,
      path: text(body.path, 500) || null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    })
    if (error) throw error
    return json({ success: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to record error' }, 400)
  }
})
