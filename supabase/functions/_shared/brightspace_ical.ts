type IcsProperty = { value: string, params: Record<string, string> }
type IcsEvent = Record<string, IcsProperty | undefined> & { EXDATE?: IcsProperty[] }
type BrightspaceEvent = { source_event_id: string, title: string, event_date: string }

function unfoldCalendar(text: string) {
  return text.replace(/\r?\n[ \t]/g, '').replace(/\r/g, '\n')
}

function parseProperty(line: string): { name: string, property: IcsProperty } | null {
  const colon = line.indexOf(':')
  if (colon < 1) return null
  const [rawName, ...rawParams] = line.slice(0, colon).split(';')
  const params: Record<string, string> = {}
  rawParams.forEach((part) => {
    const equals = part.indexOf('=')
    if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1).replace(/^"|"$/g, '')
  })
  return { name: rawName.toUpperCase(), property: { value: line.slice(colon + 1).trim(), params } }
}

function unescapeValue(value: string) {
  return value.replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function dateKey(value = ''): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day] = match
  const utcTime = value.match(/^\d{8}T(\d{2})(\d{2})(\d{2})Z$/)
  if (utcTime) {
    const instant = new Date(`${year}-${month}-${day}T${utcTime[1]}:${utcTime[2]}:${utcTime[3]}Z`)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant)
    const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${fields.year}-${fields.month}-${fields.day}`
  }
  const date = new Date(`${year}-${month}-${day}T12:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null
  return `${year}-${month}-${day}`
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function dayDistance(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000)
}

function newYorkToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

function recurrenceDates(
  start: string,
  ruleValue: string | undefined,
  exdates: Set<string>,
  limit: number,
  windowStart: string,
  windowEnd: string,
) {
  if (start > windowEnd) return []
  const rule = Object.fromEntries((ruleValue || '').split(';').map((part) => {
    const index = part.indexOf('=')
    return index > 0 ? [part.slice(0, index).toUpperCase(), part.slice(index + 1).toUpperCase()] : ['', '']
  }).filter(([key]) => key))
  const frequency = rule.FREQ
  if (!['DAILY', 'WEEKLY'].includes(frequency || '')) {
    return start >= windowStart && !exdates.has(start) ? [start] : []
  }

  const interval = Math.max(1, Math.min(52, Number(rule.INTERVAL) || 1))
  const maxCount = Math.max(1, Math.min(limit, Number(rule.COUNT) || limit))
  const until = dateKey(rule.UNTIL || '') || windowEnd
  const byDays = String(rule.BYDAY || '').split(',').map((day) => ({ SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 } as Record<string, number>)[day]).filter((day) => day !== undefined)
  const startDate = new Date(`${start}T12:00:00Z`)
  const startWeekOffset = (startDate.getUTCDay() + 6) % 7
  const weeklyDays = byDays.length ? byDays : [startDate.getUTCDay()]
  const windowFirstStep = Math.max(0, dayDistance(start, windowStart))
  const windowLastStep = Math.min(dayDistance(start, windowEnd), dayDistance(start, until))
  if (windowLastStep < windowFirstStep) return []
  const dates: string[] = []
  let recurrenceCount = 0

  // Count earlier matching instances for COUNT rules without walking one day
  // at a time across a long-running series.
  if (rule.COUNT && windowFirstStep > 0) {
    if (frequency === 'DAILY') {
      recurrenceCount = Math.ceil(windowFirstStep / interval)
    } else {
      const mondayWeekday = (startDate.getUTCDay() - startWeekOffset + 7) % 7
      for (let weekIndex = 0; weekIndex * 7 - startWeekOffset < windowFirstStep; weekIndex += interval) {
        for (const weekday of weeklyDays) {
          const step = weekIndex * 7 + ((weekday - mondayWeekday + 7) % 7) - startWeekOffset
          if (step >= 0 && step < windowFirstStep) recurrenceCount += 1
        }
      }
    }
    if (recurrenceCount >= maxCount) return []
  }

  for (let step = windowFirstStep; step <= windowLastStep && dates.length < limit; step += 1) {
    const date = addDays(start, step)
    let matches = false
    if (frequency === 'DAILY') matches = step % interval === 0
    else {
      const weekIndex = Math.floor((step + startWeekOffset) / 7)
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
      matches = weekIndex % interval === 0 && weeklyDays.includes(weekday)
    }
    if (!matches) continue
    recurrenceCount += 1
    if (rule.COUNT && recurrenceCount > maxCount) break
    if (!exdates.has(date)) dates.push(date)
  }
  return dates
}

function eventRows(event: IcsEvent, cap: number): BrightspaceEvent[] {
  const title = unescapeValue(event.SUMMARY?.value || '').replace(/\s+/g, ' ').trim().slice(0, 255)
  const uid = event.UID?.value.trim()
  const startProperty = event.DTSTART || event.DUE
  const start = dateKey(startProperty?.value)
  if (!title || !start || ['CANCELLED', 'COMPLETED'].includes(event.STATUS?.value.toUpperCase() || '')) return []
  const exdates = new Set((event.EXDATE || [])
    .flatMap((property) => property.value.split(','))
    .map((value) => dateKey(value) || '')
    .filter(Boolean))
  const end = dateKey(event.DTEND?.value || '')
  const allDay = startProperty?.params.VALUE === 'DATE' || /^\d{8}$/.test(startProperty?.value || '')
  const duration = allDay && end && end > start
    ? Math.min(30, Math.max(0, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) - 1))
    : 0
  const today = newYorkToday()
  const dates = recurrenceDates(start, event.RRULE?.value, exdates, cap, addDays(today, -90), addDays(today, 365))
  const stableUid = uid || `${title}|${start}`
  const rows: BrightspaceEvent[] = []
  dates.forEach((date) => {
    for (let offset = 0; offset <= duration && rows.length < cap; offset += 1) {
      const occurrence = addDays(date, offset)
      rows.push({
        source_event_id: `${stableUid}|${occurrence}`.slice(0, 500),
        title,
        event_date: occurrence,
      })
    }
  })
  return rows
}

export function parseBrightspaceCalendar(text: string, maxEvents = 5000) {
  const normalizedText = text.toUpperCase()
  if (!normalizedText.includes('BEGIN:VCALENDAR') || !normalizedText.includes('END:VCALENDAR')) throw new Error('Brightspace did not return a valid calendar feed.')
  const events: BrightspaceEvent[] = []
  let event: IcsEvent | null = null
  let eventType: 'VEVENT' | 'VTODO' | null = null
  for (const line of unfoldCalendar(text).split(/\n/)) {
    const normalized = line.trim()
    const componentLine = normalized.toUpperCase()
    if (['BEGIN:VEVENT', 'BEGIN:VTODO'].includes(componentLine)) {
      if (event) throw new Error('Brightspace did not return a valid calendar feed.')
      event = {}
      eventType = componentLine === 'BEGIN:VEVENT' ? 'VEVENT' : 'VTODO'
      continue
    }
    if (['END:VEVENT', 'END:VTODO'].includes(componentLine)) {
      const closedEventType = componentLine.slice('END:'.length)
      if (!event || eventType !== closedEventType) throw new Error('Brightspace did not return a valid calendar feed.')
      if (events.length < maxEvents) events.push(...eventRows(event, maxEvents - events.length))
      event = null
      eventType = null
      continue
    }
    if (!event) continue
    const parsed = parseProperty(normalized)
    if (!parsed) continue
    if (parsed.name === 'EXDATE') event.EXDATE = [...(event.EXDATE || []), parsed.property]
    else if (['UID', 'SUMMARY', 'DTSTART', 'DTEND', 'DUE', 'RRULE', 'STATUS'].includes(parsed.name)) event[parsed.name] = parsed.property
  }
  if (event) throw new Error('Brightspace did not return a valid calendar feed.')
  return events.slice(0, maxEvents)
}
