import type { adminClient } from './canvas.ts'

export type CanvasGradeSnapshotInput = {
  id?: unknown
  name?: unknown
  submission?: unknown
  points_possible?: unknown
}

export type CanvasGradeChange = {
  sourceId: string
  title: string
  courseCode: string
  grade: string
  score: number | null
  pointsPossible: number | null
  postedAt: string
}

type AdminClient = ReturnType<typeof adminClient>

function dateValue(value: unknown) {
  const timestamp = Date.parse(String(value || ''))
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function numericValue(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const number = Number(value)
  return value != null && value !== '' && Number.isFinite(number) ? number : null
}

function assignmentTitle(value: unknown) {
  const title = typeof value === 'string' ? value : ''
  return title.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 300) || 'Canvas assignment'
}

function normalizedSubmission(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function gradeLabel(grade: string, score: number | null, pointsPossible: number | null) {
  if (grade) return grade
  if (score != null && pointsPossible != null) return `${score}/${pointsPossible}`
  if (score != null) return String(score)
  return 'posted'
}

export async function syncCanvasGradeSnapshots(
  admin: AdminClient,
  userId: string,
  courseId: string,
  courseCode: string,
  assignments: CanvasGradeSnapshotInput[],
  beforePersist?: (changes: CanvasGradeChange[]) => Promise<void>,
) {
  const incoming = new Map<string, { row: Record<string, unknown>, grade: string, score: number | null, pointsPossible: number | null, postedAt: string | null }>()
  for (const assignment of assignments) {
    const id = String(assignment.id || '').trim()
    if (!id) continue
    const submission = normalizedSubmission(assignment.submission)
    const grade = submission?.grade == null ? '' : String(submission.grade).trim()
    const score = numericValue(submission?.score)
    const pointsPossible = numericValue(assignment.points_possible)
    const postedAt = submission?.grade_matches_current_submission === false
      ? null
      : dateValue(submission?.posted_at)
    incoming.set(id, {
      row: {
        user_id: userId,
        canvas_assignment_id: id,
        canvas_course_id: courseId,
        assignment_title: assignmentTitle(assignment.name),
        grade: grade || null,
        score,
        points_possible: pointsPossible,
        posted_at: postedAt,
        observed_at: new Date().toISOString(),
      },
      grade,
      score,
      pointsPossible,
      postedAt,
    })
  }
  const ids = [...incoming.keys()]
  if (!ids.length) return []

  const previousRows: Record<string, unknown>[] = []
  for (let offset = 0; offset < ids.length; offset += 500) {
    const { data, error } = await admin.from('canvas_grade_snapshots')
      .select('canvas_assignment_id,assignment_title,grade,score,points_possible,posted_at')
      .eq('user_id', userId)
      .in('canvas_assignment_id', ids.slice(offset, offset + 500))
    if (error) throw new Error('Canvas grade history could not be checked. Grades were not synced.')
    previousRows.push(...(data || []))
  }
  const previousById = new Map((previousRows || []).map((row: Record<string, unknown>) => [String(row.canvas_assignment_id), row]))
  const alerts: CanvasGradeChange[] = []
  for (const [id, current] of incoming) {
    const previous = previousById.get(id)
    const gradeChanged = previous && current.postedAt && (
      !dateValue(previous.posted_at)
      || dateValue(previous.posted_at) !== current.postedAt
      || String(previous.grade || '') !== current.grade
      || numericValue(previous.score) !== current.score
      || numericValue(previous.points_possible) !== current.pointsPossible
    )
    if (gradeChanged) {
      alerts.push({
        sourceId: id,
        title: String(current.row.assignment_title),
        courseCode,
        grade: gradeLabel(current.grade, current.score, current.pointsPossible),
        score: current.score,
        pointsPossible: current.pointsPossible,
        postedAt: current.postedAt!,
      })
    }
  }

  if (alerts.length && beforePersist) await beforePersist(alerts)

  const rows = [...incoming.values()].map((item) => item.row)
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await admin.from('canvas_grade_snapshots').upsert(rows.slice(offset, offset + 500), {
      onConflict: 'user_id,canvas_assignment_id',
    })
    if (error) throw new Error('Canvas grades could not be saved. Try syncing again.')
  }
  return alerts
}
