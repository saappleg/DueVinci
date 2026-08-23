import { corsHeaders, entitledConnection, json } from '../_shared/canvas.ts'

const colors = ['#4f46e5', '#0f766e', '#c2410c', '#be123c', '#7c3aed', '#0369a1']
const colorFor = (id: unknown) => colors[String(id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { selectedIds } = await req.json()
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) throw new Error('Choose at least one course.')
    const requested = new Set(selectedIds.map(String))
    const { admin, user, connection } = await entitledConnection(req)
    const response = await fetch(`${connection.canvas_domain}/api/v1/courses?enrollment_state=active`, { headers: { Authorization: `Bearer ${connection.canvas_token}`, Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Canvas returned HTTP ${response.status}.`)
    const now = new Date().toISOString()
    const courses = (await response.json()).filter((course: any) => requested.has(String(course.id)) && String(course.name || '').trim())
      .map((course: any) => ({ user_id: user.id, name: String(course.name).trim(), code: String(course.course_code || course.name).trim(), emoji: '📚', color: colorFor(course.id), lms_source_id: String(course.id), lms_provider: 'canvas', updated_at: now }))
    if (courses.length === 0) throw new Error('The selected courses are no longer active in Canvas.')
    const { error } = await admin.from('courses').upsert(courses, { onConflict: 'user_id,lms_source_id' })
    if (error) throw error
    return json({ success: true, synced: courses.length })
  } catch (error) { return json({ error: error.message }, 400) }
})
