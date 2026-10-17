import { corsHeaders, entitledConnection, hasFeature, json } from '../_shared/canvas.ts'
import { DEV_MOCK_CANVAS_ASSIGNMENTS, DEV_MOCK_CANVAS_COURSES, isMockCanvasConnection } from '../_shared/mock_canvas.ts'
import { detectCanvasAssignmentChanges, getCanvasCoursesEligibleForNewAlerts, type CanvasAssignmentSnapshot } from '../_shared/canvas_assignment_changes.ts'
import { sendCanvasAssignmentChangeAlerts, sendCanvasGradeAlerts } from '../_shared/lms_change_alerts.ts'
import { syncCanvasGradeSnapshots } from '../_shared/canvas_grade_alerts.ts'
import { canvasDateKey as dateKey, canvasTermDateRanges as termDateRanges, clampCanvasDueDate } from '../_shared/canvas_coursework.ts'

const colors = ['#4f46e5', '#0f766e', '#c2410c', '#be123c', '#7c3aed', '#0369a1']
const colorFor = (id: unknown) => colors[String(id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]

type CanvasCourse = { id: unknown, name?: unknown, course_code?: unknown }
type CanvasAssignment = { id: unknown, name?: unknown, due_at?: unknown, submission_types?: unknown, submission?: unknown, points_possible?: unknown }
type SavedCourse = { id: string, lms_source_id: string, term: string | null, start_date: string | null, end_date: string | null, created_at?: string }

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
    const { admin, user, profile, connection } = await entitledConnection(req)
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
      .select('id,lms_source_id,term,start_date,end_date,created_at')
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
    let changeAlerts: ReturnType<typeof detectCanvasAssignmentChanges> = []
    let alertsEnabled = false
    if (preferenceRow?.preferences?.duevinci_lms_change_alerts_enabled === 'true') {
      try {
        alertsEnabled = await hasFeature(admin, profile || {}, 'lms_change_alerts')
        if (alertsEnabled && assignmentPayload.length) {
          const courseIds = [...new Set(assignmentPayload.map((assignment) => assignment.course_id))]
          const { data: existing, error: existingError } = await admin.from('assignments')
            .select('lms_source_id, title, due_date, course_id').eq('user_id', user.id).eq('lms_provider', 'canvas').in('course_id', courseIds)
          if (existingError) throw existingError
          const existingRows = (existing || []) as CanvasAssignmentSnapshot[]
          const eligibleNewCourseIds = getCanvasCoursesEligibleForNewAlerts(savedCourses || [], connection.last_synced_at)
          const courseCodeById = new Map<string, string>()
          for (const course of (savedCourses || []) as SavedCourse[]) {
            courseCodeById.set(course.id, String(selectedCourses.find((item) => String(item.id) === String(course.lms_source_id))?.course_code || course.lms_source_id))
          }
          const incoming = assignmentPayload.map((assignment) => ({
            ...assignment, course_code: courseCodeById.get(String(assignment.course_id)) || '',
          })) as CanvasAssignmentSnapshot[]
          changeAlerts = detectCanvasAssignmentChanges(existingRows, incoming).filter((change) =>
            change.kind !== 'new_assignment' || eligibleNewCourseIds.has(change.courseId))
        }
      } catch (alertSetupError) {
        console.warn('Canvas change alerts were skipped during sync:', alertSetupError instanceof Error ? alertSetupError.message : alertSetupError)
        changeAlerts = []
      }
    }
    if (assignmentPayload.length) {
      const { error: assignmentError } = await admin.from('assignments').upsert(assignmentPayload, { onConflict: 'user_id,lms_source_id' })
      if (assignmentError) throw assignmentError
    }
    let sentChangeAlerts = 0
    if (alertsEnabled && changeAlerts.length) {
      try {
        sentChangeAlerts = await sendCanvasAssignmentChangeAlerts(admin, user.id, changeAlerts)
      } catch (alertError) {
        console.warn('Canvas assignment changes synced, but push alerts could not be sent:', alertError instanceof Error ? alertError.message : alertError)
      }
    }
    let sentGradeAlerts = 0
    try {
      await Promise.all(assignmentsByCourse.map(({ course, assignments }) => {
        const savedCourse = savedCourseBySourceId.get(String(course.id))
        if (!savedCourse) return
        const courseCode = String(selectedCourses.find((item) => String(item.id) === String(course.id))?.course_code || savedCourse.lms_source_id)
        return syncCanvasGradeSnapshots(admin, user.id, savedCourse.id, courseCode, assignments, async (changes) => {
          if (connection.grade_alerts_enabled && await hasFeature(admin, profile || {}, 'canvas_auto_sync')) {
            sentGradeAlerts += await sendCanvasGradeAlerts(admin, user.id, changes)
          }
        })
      }))
    } catch (gradeError) {
      console.warn('Canvas coursework synced, but grade alerts were skipped:', gradeError instanceof Error ? gradeError.message : gradeError)
    }
    await Promise.all([
      admin.from('profiles').update({ canvas_last_synced_at: now, updated_at: now }).eq('user_id', user.id),
      admin.from('canvas_connections').update({ last_synced_at: now, last_auto_sync_claimed_at: now, updated_at: now }).eq('user_id', user.id),
    ])
    return json({ success: true, synced: selectedCourses.length, syncedCourses: selectedCourses.length, syncedAssignments: assignmentPayload.length, adjustedAssignments, conflictingWindowAssignments, invalidCanvasDateAssignments, sentChangeAlerts, sentGradeAlerts, syncedAt: now })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Canvas sync error.'
    console.error('canvas-sync error:', message)
    return json({ error: message }, 400)
  }
})
