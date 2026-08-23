import { corsHeaders, entitledConnection, json } from '../_shared/canvas.ts'
import { DEV_MOCK_CANVAS_ASSIGNMENTS, DEV_MOCK_CANVAS_COURSES, isMockCanvasConnection } from '../_shared/mock_canvas.ts'

const colors = ['#4f46e5', '#0f766e', '#c2410c', '#be123c', '#7c3aed', '#0369a1']
const colorFor = (id: unknown) => colors[String(id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]

type CanvasCourse = { id: unknown, name?: unknown, course_code?: unknown }
type CanvasAssignment = { id: unknown, name?: unknown, due_at?: unknown, submission_types?: unknown }

async function canvasAssignments(domain: string, token: string, courseId: unknown): Promise<CanvasAssignment[]> {
  const response = await fetch(`${domain}/api/v1/courses/${courseId}/assignments?include[]=submission`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Canvas assignments returned HTTP ${response.status}.`)
  return await response.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { selectedIds } = await req.json()
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) throw new Error('Choose at least one course.')
    const requested = new Set(selectedIds.map(String))
    const { admin, user, connection } = await entitledConnection(req)
    const mockConnection = isMockCanvasConnection(connection.canvas_domain)
    const sourceCourses: CanvasCourse[] = mockConnection
      ? DEV_MOCK_CANVAS_COURSES
      : await (async () => {
        const response = await fetch(`${connection.canvas_domain}/api/v1/courses?enrollment_state=active`, { headers: { Authorization: `Bearer ${connection.canvas_token}`, Accept: 'application/json' } })
        if (!response.ok) throw new Error(`Canvas returned HTTP ${response.status}.`)
        return await response.json()
      })()
    const selectedCourses = sourceCourses.filter((course) => requested.has(String(course.id)) && String(course.name || '').trim())
    if (selectedCourses.length === 0) throw new Error('The selected courses are no longer active in Canvas.')

    const now = new Date().toISOString()
    const coursePayload = selectedCourses.map((course) => ({
      user_id: user.id,
      name: String(course.name).trim(),
      code: String(course.course_code || course.name).trim(),
      emoji: '📚', color: colorFor(course.id), lms_source_id: String(course.id), lms_provider: 'canvas', updated_at: now,
    }))
    const { data: savedCourses, error: courseError } = await admin.from('courses')
      .upsert(coursePayload, { onConflict: 'user_id,lms_source_id' })
      .select('id,lms_source_id')
    if (courseError) throw courseError
    const courseIdBySourceId = new Map((savedCourses || []).map((course: { id: string, lms_source_id: string }) => [String(course.lms_source_id), course.id]))

    const assignmentsByCourse = await Promise.all(selectedCourses.map(async (course) => ({
      course,
      assignments: mockConnection
        ? (DEV_MOCK_CANVAS_ASSIGNMENTS[String(course.id)] || []) as CanvasAssignment[]
        : await canvasAssignments(connection.canvas_domain, connection.canvas_token, course.id),
    })))
    const assignmentPayload = assignmentsByCourse.flatMap(({ course, assignments }) => {
      const courseId = courseIdBySourceId.get(String(course.id))
      if (!courseId) return []
      return assignments
        .filter((assignment) => String(assignment.name || '').trim() && assignment.due_at)
        .map((assignment) => {
          return {
            user_id: user.id, course_id: courseId, title: String(assignment.name).trim(),
            // Canvas imports use only fields guaranteed by the existing
            // assignments schema; task categorization stays editable in the UI.
            due_date: new Date(String(assignment.due_at)).toISOString(), is_completed: false,
            lms_source_id: String(assignment.id), lms_provider: 'canvas', lms_updated_at: now,
          }
        })
    })
    if (assignmentPayload.length) {
      const { error: assignmentError } = await admin.from('assignments').upsert(assignmentPayload, { onConflict: 'user_id,lms_source_id' })
      if (assignmentError) throw assignmentError
    }
    await Promise.all([
      admin.from('profiles').update({ canvas_last_synced_at: now, updated_at: now }).eq('user_id', user.id),
      admin.from('canvas_connections').update({ last_synced_at: now, updated_at: now }).eq('user_id', user.id),
    ])
    return json({ success: true, synced: selectedCourses.length, syncedCourses: selectedCourses.length, syncedAssignments: assignmentPayload.length, syncedAt: now })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Canvas sync error.'
    console.error('canvas-sync error:', message)
    return json({ error: message }, 400)
  }
})
