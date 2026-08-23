import { corsHeaders, authenticatedUser, json } from '../_shared/canvas.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { admin, user } = await authenticatedUser(req)
    const { error } = await admin.from('canvas_connections').delete().eq('user_id', user.id)
    if (error) throw error
    await admin.from('profiles').update({ canvas_domain: null, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    return json({ success: true })
  } catch (error) { return json({ error: error.message }, 400) }
})
