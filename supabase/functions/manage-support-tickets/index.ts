import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const allowedStatuses = new Set(['sending', 'delivered', 'delivery_failed', 'open', 'in_progress', 'resolved', 'closed'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) throw new Error('Unauthorized')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: userError } = await admin.auth.getUser(authorization.replace('Bearer ', ''))
    if (userError || !user?.email) throw new Error('Unauthorized')
    const allowlist = (Deno.env.get('SUPPORT_ADMIN_EMAILS') || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
    if (!allowlist.includes(user.email.toLowerCase())) throw new Error('This account is not authorized to manage support tickets.')

    const body = await req.json()
    if (body.action === 'list') {
      const { data, error } = await admin.from('support_tickets').select('id, email, category, subject, message, status, created_at').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return json({ tickets: data || [] })
    }
    if (body.action === 'update') {
      const id = String(body.id || '')
      const status = String(body.status || '')
      if (!id || !allowedStatuses.has(status)) throw new Error('Invalid ticket update.')
      const { error } = await admin.from('support_tickets').update({ status }).eq('id', id)
      if (error) throw error
      return json({ success: true })
    }
    throw new Error('Unknown support action.')
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to manage support tickets.' }, 400)
  }
})
