import { hasFeature, isSubscriptionActive, type adminClient } from './canvas.ts'
import { decryptCanvasToken, encryptCanvasToken } from './canvas_crypto.ts'
import { canvasTermDateRanges, clampCanvasDueDate } from './canvas_coursework.ts'
import { detectCanvasAssignmentChanges, getCanvasCoursesEligibleForNewAlerts, type CanvasAssignmentSnapshot } from './canvas_assignment_changes.ts'
import { sendCanvasAssignmentChangeAlerts, sendCanvasGradeAlerts } from './lms_change_alerts.ts'
import { syncCanvasGradeSnapshots, type CanvasGradeSnapshotInput } from './canvas_grade_alerts.ts'

type AdminClient = ReturnType<typeof adminClient>
type CanvasProfile = { subscription_status?: string | null, trial_end?: string | null, subscription_plan?: string | null }
const MAX_SCHEDULED_COURSES = 100
const MAX_SCHEDULED_ASSIGNMENTS = 10_000
const MAX_ASSIGNMENT_PAGES_PER_COURSE = 10

type ScheduledCanvasConnection = {
  user_id: string
  canvas_domain: string
  canvas_token: string | null
  canvas_token_encrypted: string | null
  last_synced_at: string | null
  auto_sync_enabled: boolean
  grade_alerts_enabled: boolean
}

type CanvasCourse = {
  id: string
  lms_source_id: string
  term: string | null
  start_date: string | null
  end_date: string | null
  created_at?: string
  code?: string
}

type CanvasAssignment = CanvasGradeSnapshotInput & {
  due_at?: unknown
  points_possible?: unknown
  submission_types?: unknown
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function parseSavedCourses(value: unknown): CanvasCourse[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = objectValue(item)
    if (!row || typeof row.id !== 'string' || typeof row.lms_source_id !== 'string' || !/^\d+$/.test(row.lms_source_id)) return []
    return [{
      id: row.id,
      lms_source_id: row.lms_source_id,
      term: nullableString(row.term),
      start_date: nullableString(row.start_date),
      end_date: nullableString(row.end_date),
      created_at: nullableString(row.created_at) || undefined,
      code: nullableString(row.code) || undefined,
    }]
  })
}

function parseAssignmentSnapshots(value: unknown): CanvasAssignmentSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = objectValue(item)
    if (!row) return []
    return [{
      lms_source_id: row.lms_source_id,
      title: row.title,
      due_date: row.due_date,
      course_id: row.course_id,
    }]
  })
}

function normalizedCanvasDomain(raw: unknown) {
  let url: URL
  try { url = new URL(String(raw || '')) } catch { throw new Error('Reconnect Canvas; the saved Canvas address is invalid.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Reconnect Canvas; the saved Canvas address is invalid.')
  }
  return url.origin
}

function nextPageUrl(header: string | null, baseUrl: URL, courseId: string) {
  if (!header) return null
  const nextLink = header.split(',').map((part) => part.trim()).find((part) => /rel="next"/.test(part))
  const match = nextLink?.match(/^<([^>]+)>/)
  if (!match) return null
  const next = new URL(match[1], baseUrl)
  if (next.origin !== baseUrl.origin || next.pathname !== `/api/v1/courses/${courseId}/assignments`) {
    throw new Error('Canvas returned an invalid coursework page link.')
  }
  return next
}

async function canvasAssignments(domain: string, token: string, courseId: string) {
  if (!/^\d+$/.test(courseId)) throw new Error('A saved Canvas course reference is invalid. Reconnect and sync courses again.')
  const origin = new URL(normalizedCanvasDomain(domain))
  const url = new URL(`/api/v1/courses/${courseId}/assignments`, origin)
  url.searchParams.append('include[]', 'submission')
  url.searchParams.set('per_page', '100')
  const assignments: CanvasAssignment[] = []
  let next: URL | null = url
  let pageCount = 0
  while (next) {
    pageCount += 1
    if (pageCount > MAX_ASSIGNMENT_PAGES_PER_COURSE) {
      throw new Error('A selected Canvas course has more than 1,000 assignments. Reduce the selection and try again.')
    }
    let response: Response
    try {
      response = await fetch(next, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      })
    } catch {
      throw new Error('Could not reach Canvas. The automatic refresh will try again later.')
    }
    if (response.status === 401 || response.status === 403) throw new Error('Canvas rejected the saved token. Reconnect Canvas to resume scheduled refresh.')
    if (response.status === 429 || response.status >= 500) throw new Error('Canvas is temporarily unavailable. The automatic refresh will try again later.')
    if (!response.ok) throw new Error(`Canvas returned HTTP ${response.status}. Check the connection and try again.`)
    let page: unknown
    try { page = await response.json() } catch { throw new Error('Canvas returned an invalid coursework response.') }
    if (!Array.isArray(page)) throw new Error('Canvas returned an invalid coursework response.')
    for (const item of page) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const record = objectValue(item)
      if (!record) continue
      const id = record.id
      if ((typeof id !== 'string' && typeof id !== 'number') || !/^\d+$/.test(String(id))) continue
      assignments.push({
        id,
        name: typeof record.name === 'string' ? record.name : '',
        due_at: record.due_at,
        points_possible: record.points_possible,
        submission: record.submission,
      })
    }
    if (assignments.length > 5000) throw new Error('Canvas has more than 5,000 assignments in a selected course.')
    next = nextPageUrl(response.headers.get('link'), next, courseId)
  }
  return assignments
}

async function allCourseAssignments(domain: string, token: string, courses: CanvasCourse[]) {
  const result: Array<{ course: CanvasCourse, assignments: CanvasAssignment[] }> = []
  for (let offset = 0; offset < courses.length; offset += 10) {
    const batch = courses.slice(offset, offset + 10)
    result.push(...await Promise.all(batch.map(async (course) => ({
      course,
      assignments: await canvasAssignments(domain, token, course.lms_source_id),
    }))))
    const assignmentCount = result.reduce((total, item) => total + item.assignments.length, 0)
    if (assignmentCount > MAX_SCHEDULED_ASSIGNMENTS
      || (assignmentCount === MAX_SCHEDULED_ASSIGNMENTS && offset + batch.length < courses.length)) {
      throw new Error('Canvas reached the 10,000 assignment refresh limit. Reduce the selected courses and try again.')
    }
  }
  return result
}

export async function runScheduledCanvasSync(
  admin: AdminClient,
  connection: ScheduledCanvasConnection,
  profile: CanvasProfile,
  now = new Date().toISOString(),
) {
  if (!connection.auto_sync_enabled || !isSubscriptionActive(profile)) {
    throw new Error('Canvas scheduled refresh is no longer enabled for this plan.')
  }
  if (!await hasFeature(admin, profile, 'canvas_auto_sync')) {
    throw new Error('Canvas scheduled refresh is not included in the current plan.')
  }

  let token = connection.canvas_token_encrypted
    ? await decryptCanvasToken(connection.canvas_token_encrypted)
    : connection.canvas_token || ''
  if (!token) throw new Error('Canvas credentials were not found. Reconnect Canvas to resume scheduled refresh.')
  if (!connection.canvas_token_encrypted) {
    const { error } = await admin.from('canvas_connections').update({
      canvas_token: null,
      canvas_token_encrypted: await encryptCanvasToken(token),
      updated_at: now,
    }).eq('user_id', connection.user_id)
    if (error) throw new Error('The saved Canvas token could not be secured. Scheduled refresh was stopped.')
  }

  const { data: courses, error: courseError } = await admin.from('courses')
    .select('id,lms_source_id,term,start_date,end_date,created_at,code')
    .eq('user_id', connection.user_id)
    .eq('lms_provider', 'canvas')
    .not('lms_source_id', 'is', null)
    .limit(MAX_SCHEDULED_COURSES + 1)
  if (courseError) throw new Error('Canvas course selections could not be loaded.')
  const selectedCourses = parseSavedCourses(courses)
  if (!Array.isArray(courses) || selectedCourses.length !== courses.length) {
    throw new Error('Canvas course selections are invalid. Sync courses again before enabling automatic refresh.')
  }
  if (selectedCourses.length > MAX_SCHEDULED_COURSES) {
    throw new Error(`Automatic Canvas refresh supports up to ${MAX_SCHEDULED_COURSES} selected courses. Reduce the selection and try again.`)
  }
  if (!selectedCourses.length) throw new Error('Select at least one Canvas course before enabling automatic refresh.')

  const { data: preferenceRow, error: preferenceError } = await admin.from('user_preferences')
    .select('preferences').eq('user_id', connection.user_id).maybeSingle()
  if (preferenceError) throw new Error('Course calendar settings could not be loaded.')
  const ranges = canvasTermDateRanges(preferenceRow?.preferences)
  const assignmentsByCourse = await allCourseAssignments(normalizedCanvasDomain(connection.canvas_domain), token, selectedCourses)
  const savedCourseById = new Map(selectedCourses.map((course) => [String(course.id), course]))
  const importedAssignments = assignmentsByCourse.flatMap(({ course, assignments }) => {
    const savedCourse = savedCourseById.get(String(course.id))
    if (!savedCourse) return []
    return assignments
      .filter((assignment) => String(assignment.name || '').trim() && assignment.due_at)
      .flatMap((assignment) => {
        const boundedDate = clampCanvasDueDate(assignment.due_at, savedCourse, ranges)
        if (!boundedDate || boundedDate.invalidRange) return []
        return [{
          user_id: connection.user_id,
          course_id: savedCourse.id,
          title: String(assignment.name).trim(),
          due_date: boundedDate.value,
          lms_source_id: String(assignment.id),
          lms_provider: 'canvas',
          lms_updated_at: now,
        }]
      })
  })

  let assignmentChanges: ReturnType<typeof detectCanvasAssignmentChanges> = []
  const alertsEnabled = preferenceRow?.preferences?.duevinci_lms_change_alerts_enabled === 'true'
    && await hasFeature(admin, profile, 'lms_change_alerts')
  if (alertsEnabled && importedAssignments.length) {
    const courseIds = [...new Set(importedAssignments.map((assignment) => assignment.course_id))]
    const { data: existing, error: existingError } = await admin.from('assignments')
      .select('lms_source_id,title,due_date,course_id')
      .eq('user_id', connection.user_id)
      .eq('lms_provider', 'canvas')
      .in('course_id', courseIds)
    if (existingError) throw new Error('Canvas assignment history could not be checked.')
    const courseCodeById = new Map(selectedCourses.map((course) => [String(course.id), String(course.code || course.lms_source_id)]))
    const existingRows = parseAssignmentSnapshots(existing)
    const eligibleNewCourseIds = getCanvasCoursesEligibleForNewAlerts(selectedCourses, connection.last_synced_at)
    const incoming: CanvasAssignmentSnapshot[] = importedAssignments.map((assignment) => ({
      ...assignment,
      course_code: courseCodeById.get(String(assignment.course_id)) || '',
    }))
    assignmentChanges = detectCanvasAssignmentChanges(existingRows, incoming).filter((change) => change.kind !== 'new_assignment'
      || eligibleNewCourseIds.has(change.courseId))
  }

  if (importedAssignments.length) {
    const { error: assignmentError } = await admin.from('assignments').upsert(importedAssignments, { onConflict: 'user_id,lms_source_id' })
    if (assignmentError) throw new Error('Canvas assignments could not be saved. The next refresh will retry.')
  }

  let sentAssignmentAlerts = 0
  if (assignmentChanges.length) {
    try { sentAssignmentAlerts = await sendCanvasAssignmentChangeAlerts(admin, connection.user_id, assignmentChanges) }
    catch (error) { console.warn('Canvas assignment changes synced, but push alerts could not be sent:', error instanceof Error ? error.message : 'unknown error') }
  }

  let sentGradeAlerts = 0
  for (const { course, assignments } of assignmentsByCourse) {
    const courseCode = String(course.code || course.lms_source_id)
    await syncCanvasGradeSnapshots(admin, connection.user_id, course.id, courseCode, assignments, async (changes) => {
      if (!connection.grade_alerts_enabled) return
      sentGradeAlerts += await sendCanvasGradeAlerts(admin, connection.user_id, changes)
    })
  }

  const { error: connectionUpdateError } = await admin.from('canvas_connections').update({
    last_synced_at: now,
    last_auto_sync_error: null,
    updated_at: now,
  }).eq('user_id', connection.user_id)
  if (connectionUpdateError) throw new Error('Canvas data synced, but the refresh status could not be saved.')
  const { error: profileError } = await admin.from('profiles')
    .update({ canvas_last_synced_at: now, updated_at: now }).eq('user_id', connection.user_id)
  if (profileError) throw new Error('Canvas data synced, but the refresh status could not be saved.')
  return {
    syncedCourses: selectedCourses.length,
    syncedAssignments: importedAssignments.length,
    sentAssignmentAlerts,
    sentGradeAlerts,
  }
}

export type { ScheduledCanvasConnection }
