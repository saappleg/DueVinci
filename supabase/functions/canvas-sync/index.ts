import { corsHeaders, entitledConnection, json } from '../_shared/canvas.ts'
import { DEV_MOCK_CANVAS_ASSIGNMENTS, DEV_MOCK_CANVAS_COURSES, isMockCanvasConnection } from '../_shared/mock_canvas.ts'

const colors = ['#4f46e5', '#0f766e', '#c2410c', '#be123c', '#7c3aed', '#0369a1']
const colorFor = (id: unknown) => colors[String(id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]

type CanvasCourse = { id: unknown, name?: unknown, course_code?: unknown }
type CanvasAssignment = { id: unknown, name?: unknown, due_at?: unknown, submission_types?: unknown }
type SavedCourse = { id: string, lms_source_id: string, term: string | null, start_date: string | null, end_date: string | null }

function dateKey(value: unknown): string {
  const key = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : ''
}

function termDateRanges(preferences: unknown): Record<string, { start_date?: unknown, end_date?: unknown }> {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return {}
  const raw = (preferences as Record<string, unknown>).duevinci_term_details
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function clampCanvasDueDate(value: unknown, course: SavedCourse, ranges: ReturnType<typeof termDateRanges>): { value: string, adjusted: boolean, invalidRange: boolean } | null {
  const dueAt = new Date(String(value || ''))
  if (Number.isNaN(dueAt.valueOf())) return null
  const termRange = ranges[String(course.term || '').trim()] || {}
  const starts = [dateKey(course.start_date), dateKey(termRange.start_date)].filter(Boolean).sort()
  const ends = [dateKey(course.end_date), dateKey(termRange.end_date)].filter(Boolean).sort()
  const start = starts.at(-1) || ''
  const end = ends[0] || ''
  const originalKey = dueAt.toISOString().slice(0, 10)
  if (start && end && start > end) return { value: dueAt.toISOString(), adjusted: false, invalidRange: true }
  const boundedKey = start && originalKey < start ? start : end && originalKey > end ? end : originalKey
  if (boundedKey === originalKey) return { value: dueAt.toISOString(), adjusted: false, invalidRange: false }
  return { value: `${boundedKey}T${dueAt.toISOString().slice(11)}`, adjusted: true, invalidRange: false }
}

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
      .select('id,lms_source_id,term,start_date,end_date')
    if (courseError) throw courseError
    const savedCourseBySourceId = new Map((savedCourses || []).map((course: SavedCourse) => [String(course.lms_source_id), course]))
    const { data: preferenceRow, error: preferenceError } = await admin.from('user_preferences')
      .select('preferences').eq('user_id', user.id).maybeSingle()
    if (preferenceError) throw preferenceError
    const ranges = termDateRanges(preferenceRow?.preferences)

    const assignmentsByCourse = await Promise.all(selectedCourses.map(async (course) => ({
      course,
      assignments: mockConnection
        ? (DEV_MOCK_CANVAS_ASSIGNMENTS[String(course.id)] || []) as CanvasAssignment[]
        : await canvasAssignments(connection.canvas_domain, connection.canvas_token, course.id),
    })))
    let conflictingWindowAssignments = 0
    let invalidCanvasDateAssignments = 0
    const importedAssignments = assignmentsByCourse.flatMap(({ course, assignments }) => {
      const savedCourse = savedCourseBySourceId.get(String(course.id))
      if (!savedCourse) return []
      return assignments
        .filter((assignment) => String(assignment.name || '').trim() && assignment.due_at)
        .flatMap((assignment) => {
          const boundedDate = clampCanvasDueDate(assignment.due_at, savedCourse, ranges)
          if (!boundedDate) {
            invalidCanvasDateAssignments += 1
            return []
          }
          if (boundedDate.invalidRange) {
            conflictingWindowAssignments += 1
            return []
          }
          return [{
            user_id: user.id, course_id: savedCourse.id, title: String(assignment.name).trim(),
            // Canvas imports use only fields guaranteed by the existing
            // assignments schema; task categorization stays editable in the UI.
            // Respect the saved class and term windows even when Canvas dates
            // fall outside the student's DueVinci planning range.
            // Leave completion unset: new rows use the database default, and
            // existing completions must survive a later Canvas refresh.
            due_date: boundedDate.value,
            lms_source_id: String(assignment.id), lms_provider: 'canvas', lms_updated_at: now,
            _date_adjusted: boundedDate.adjusted,
          }]
        })
    })
    const adjustedAssignments = importedAssignments.filter((assignment) => assignment._date_adjusted).length
    const assignmentPayload = importedAssignments.map(({ _date_adjusted, ...assignment }) => assignment)
    if (assignmentPayload.length) {
      const { error: assignmentError } = await admin.from('assignments').upsert(assignmentPayload, { onConflict: 'user_id,lms_source_id' })
      if (assignmentError) throw assignmentError
    }
    await Promise.all([
      admin.from('profiles').update({ canvas_last_synced_at: now, updated_at: now }).eq('user_id', user.id),
      admin.from('canvas_connections').update({ last_synced_at: now, updated_at: now }).eq('user_id', user.id),
    ])
    return json({ success: true, synced: selectedCourses.length, syncedCourses: selectedCourses.length, syncedAssignments: assignmentPayload.length, adjustedAssignments, conflictingWindowAssignments, invalidCanvasDateAssignments, syncedAt: now })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Canvas sync error.'
    console.error('canvas-sync error:', message)
    return json({ error: message }, 400)
  }
})
