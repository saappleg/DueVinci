import { corsHeaders, authenticatedUser, normalizeCanvasDomain, json } from '../_shared/canvas.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { admin, user } = await authenticatedUser(req)
    const { canvasUrl, canvasToken } = await req.json()
    const domain = normalizeCanvasDomain(canvasUrl)
    const token = String(canvasToken || '').trim()
    if (!token) throw new Error('Canvas access token is required.')
    const response = await fetch(`${domain}/api/v1/users/self/profile`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!response.ok) throw new Error(response.status === 401 ? 'Canvas token is invalid or expired.' : `Canvas returned HTTP ${response.status}.`)
    const canvasUser = await response.json()
    const now = new Date().toISOString()
    const { error } = await admin.from('canvas_connections').upsert({ user_id: user.id, canvas_domain: domain, canvas_token: token, updated_at: now }, { onConflict: 'user_id' })
    if (error) throw error
    await admin.from('profiles').update({ canvas_domain: domain, updated_at: now }).eq('user_id', user.id)
    return json({ success: true, domain, name: canvasUser.name || canvasUser.sortable_name || 'Canvas Student' })
  } catch (error) { return json({ error: error.message }, 400) }
})
