import { corsHeaders, entitledConnection, json } from '../_shared/canvas.ts'
import { DEV_MOCK_CANVAS_COURSES, isMockCanvasConnection } from '../_shared/mock_canvas.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { connection } = await entitledConnection(req)
    if (isMockCanvasConnection(connection.canvas_domain)) return json({ courses: DEV_MOCK_CANVAS_COURSES })
    const response = await fetch(`${connection.canvas_domain}/api/v1/courses?enrollment_state=active&include[]=term`, { headers: { Authorization: `Bearer ${connection.canvas_token}`, Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Canvas returned HTTP ${response.status}.`)
    const courses = (await response.json()).filter((course: any) => String(course.name || '').trim())
      .map((course: any) => ({ id: course.id, name: course.name, course_code: course.course_code, term: course.term ? { name: course.term.name } : null }))
    return json({ courses })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Canvas course loading error.'
    console.error('canvas-courses error:', message)
    return json({ error: message }, 400)
  }
})
