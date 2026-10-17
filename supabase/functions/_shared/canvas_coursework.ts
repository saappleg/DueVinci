export function canvasDateKey(value: unknown): string {
  const key = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : ''
}

export function canvasTermDateRanges(preferences: unknown): Record<string, { start_date?: unknown, end_date?: unknown }> {
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

export function clampCanvasDueDate(
  value: unknown,
  course: { term?: string | null, start_date?: string | null, end_date?: string | null },
  ranges: ReturnType<typeof canvasTermDateRanges>,
): { value: string, adjusted: boolean, invalidRange: boolean } | null {
  const dueAt = new Date(String(value || ''))
  if (Number.isNaN(dueAt.valueOf())) return null
  const termRange = ranges[String(course.term || '').trim()] || {}
  const starts = [canvasDateKey(course.start_date), canvasDateKey(termRange.start_date)].filter(Boolean).sort()
  const ends = [canvasDateKey(course.end_date), canvasDateKey(termRange.end_date)].filter(Boolean).sort()
  const start = starts.at(-1) || ''
  const end = ends[0] || ''
  const originalKey = dueAt.toISOString().slice(0, 10)
  if (start && end && start > end) return { value: dueAt.toISOString(), adjusted: false, invalidRange: true }
  const boundedKey = start && originalKey < start ? start : end && originalKey > end ? end : originalKey
  if (boundedKey === originalKey) return { value: dueAt.toISOString(), adjusted: false, invalidRange: false }
  return { value: `${boundedKey}T${dueAt.toISOString().slice(11)}`, adjusted: true, invalidRange: false }
}
