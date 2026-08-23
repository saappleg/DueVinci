import { corsHeaders, authenticatedUser, json } from '../_shared/canvas.ts'

// The browser cannot safely delete an Auth user. This authenticated, service-role
// endpoint removes server-only Canvas credentials and then deletes the Auth user.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { admin, user } = await authenticatedUser(req)
    const { error: canvasError } = await admin.from('canvas_connections').delete().eq('user_id', user.id)
    if (canvasError) throw canvasError
    const { error: authError } = await admin.auth.admin.deleteUser(user.id)
    if (authError) throw authError
    return json({ success: true })
  } catch (error) { return json({ error: error.message }, 400) }
})
