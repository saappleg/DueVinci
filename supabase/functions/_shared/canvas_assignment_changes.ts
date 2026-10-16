export type CanvasAssignmentSnapshot = {
  lms_source_id?: unknown
  title?: unknown
  due_date?: unknown
  course_id?: unknown
  course_code?: unknown
}

export type CanvasAssignmentChange = {
  kind: 'new_assignment' | 'due_date_changed'
  sourceId: string
  title: string
  dueDate: string
  previousDueDate: string
  courseId: string
  courseCode: string
}

export function getCanvasCoursesEligibleForNewAlerts(courses: Array<{ id?: unknown, created_at?: unknown }> = [], previousSyncAt: unknown = null) {
  const lastSync = Date.parse(String(previousSyncAt || ''))
  if (!Number.isFinite(lastSync)) return new Set<string>()
  return new Set(courses.flatMap((course) => {
    const createdAt = Date.parse(String(course.created_at || ''))
    const id = String(course.id || '')
    return id && Number.isFinite(createdAt) && createdAt <= lastSync ? [id] : []
  }))
}

function sourceId(row: CanvasAssignmentSnapshot) {
  const value = String(row.lms_source_id || '').trim()
  return value
}

function normalizedDate(value: unknown) {
  if (value == null || value === '') return ''
  const text = String(value).trim()
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : text
}

function displayDate(value: unknown) {
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const normalized = normalizedDate(value)
  return normalized ? `${normalized.slice(0, 10)} ${normalized.slice(11, 16)} UTC` : ''
}

export function detectCanvasAssignmentChanges(existing: CanvasAssignmentSnapshot[] = [], incoming: CanvasAssignmentSnapshot[] = []): CanvasAssignmentChange[] {
  const existingById = new Map<string, CanvasAssignmentSnapshot>()
  existing.forEach((row) => {
    const id = sourceId(row)
    if (id) existingById.set(id, row)
  })
  const changes: CanvasAssignmentChange[] = []
  const seen = new Set<string>()
  for (const assignment of incoming) {
    const id = sourceId(assignment)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const previous = existingById.get(id)
    const oldDate = normalizedDate(previous?.due_date)
    const newDate = normalizedDate(assignment.due_date)
    if (!previous) {
      changes.push({
        kind: 'new_assignment', sourceId: id,
        title: String(assignment.title || 'Canvas assignment').trim(),
        dueDate: displayDate(assignment.due_date), previousDueDate: '',
        courseId: String(assignment.course_id || ''), courseCode: String(assignment.course_code || ''),
      })
    } else if (oldDate !== newDate) {
      changes.push({
        kind: 'due_date_changed', sourceId: id,
        title: String(assignment.title || 'Canvas assignment').trim(),
        dueDate: displayDate(assignment.due_date), previousDueDate: displayDate(previous.due_date),
        courseId: String(assignment.course_id || previous.course_id || ''), courseCode: String(assignment.course_code || previous.course_code || ''),
      })
    }
  }
  return changes
}
