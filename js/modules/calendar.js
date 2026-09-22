// --- FULLCALENDAR & ICS EXPORT MODULE ---
import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { fireConfetti, getLocalDateKey, escapeHtml } from './utils.js';
import { generateBalancedStudyPlan } from './studyPlan.js';

export let calendarInstance = null;
let lastEventModalTrigger = null;

async function getCalendarUser() {
    if (currentUser?.id) return currentUser;
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.user || null;
}

function setImportStatus(message, tone = 'muted') {
    if (typeof document === 'undefined') return;
    const status = document.getElementById('calendarImportStatus');
    if (!status) return;
    const colors = {
        muted: 'text-xs text-zinc-500 dark:text-zinc-400',
        success: 'text-xs text-emerald-600 dark:text-emerald-400',
        error: 'text-xs text-red-600 dark:text-red-400'
    };
    status.textContent = message;
    status.className = `${colors[tone] || colors.muted} mt-1`;
}

export function unescapeICSValue(value = '') {
    return String(value)
        .replace(/\\n/gi, '\n')
        .replace(/\\N/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
}

export function parseICSDate(value = '') {
    const match = String(value).match(/(?:^|[^0-9])(\d{8})(?:T|$)/);
    if (!match) return null;
    const digits = match[1];
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    const parsed = new Date(`${date}T12:00:00`);
    // The Date constructor normalizes impossible dates (2026-02-31 becomes
    // a March date). Reject those values instead of importing the wrong day.
    if (Number.isNaN(parsed.valueOf())
        || parsed.getFullYear() !== year
        || parsed.getMonth() + 1 !== month
        || parsed.getDate() !== day) return null;
    return date;
}

function addCalendarDays(dateString, amount) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return getLocalDateKey(date);
}

function isValidISODate(value = '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return !Number.isNaN(parsed.valueOf())
        && parsed.getFullYear() === Number(String(value).slice(0, 4))
        && parsed.getMonth() + 1 === Number(String(value).slice(5, 7))
        && parsed.getDate() === Number(String(value).slice(8, 10));
}

function addCalendarMonths(date, amount) {
    const originalDay = date.getDate();
    const next = new Date(date);
    next.setDate(1);
    next.setMonth(next.getMonth() + amount);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(originalDay, lastDay));
    return next;
}

function unfoldICS(text = '') {
    return String(text)
        .replace(/\r\n[ \t]/g, '')
        .replace(/\n[ \t]/g, '');
}

function parseICSProperty(line = '') {
    const separator = line.indexOf(':');
    if (separator < 0) return null;
    const left = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const [name, ...parameterParts] = left.split(';');
    const params = {};
    parameterParts.forEach((part) => {
        const equals = part.indexOf('=');
        if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1);
    });
    return { name: name.toUpperCase(), params, value };
}

function parseRecurrenceRule(rule = '') {
    return String(rule).split(';').reduce((result, part) => {
        const [key, value] = part.split('=');
        if (key && value) result[key.toUpperCase()] = value.toUpperCase();
        return result;
    }, {});
}

function monthlyRuleDates(monthCursor, parts, startDate) {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const dates = new Set();
    const dayIndexes = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

    if (parts.BYMONTHDAY) {
        String(parts.BYMONTHDAY).split(',').forEach((rawDay) => {
            const day = Number.parseInt(rawDay, 10);
            if (!Number.isInteger(day) || day === 0) return;
            const actualDay = day > 0 ? day : lastDay + day + 1;
            if (actualDay >= 1 && actualDay <= lastDay) {
                dates.add(getLocalDateKey(new Date(year, month, actualDay, 12)));
            }
        });
    }

    if (parts.BYDAY) {
        String(parts.BYDAY).split(',').forEach((token) => {
            const match = token.match(/^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
            if (!match) return;
            const weekday = dayIndexes[match[2]];
            const ordinal = match[1] ? Number.parseInt(match[1], 10) : null;
            if (ordinal) {
                if (ordinal > 0) {
                    const first = new Date(year, month, 1, 12);
                    const day = 1 + ((weekday - first.getDay() + 7) % 7) + ((ordinal - 1) * 7);
                    if (day <= lastDay) dates.add(getLocalDateKey(new Date(year, month, day, 12)));
                } else {
                    const last = new Date(year, month, lastDay, 12);
                    const day = lastDay - ((last.getDay() - weekday + 7) % 7) + ((ordinal + 1) * 7);
                    if (day >= 1) dates.add(getLocalDateKey(new Date(year, month, day, 12)));
                }
            } else {
                for (let day = 1; day <= lastDay; day += 1) {
                    if (new Date(year, month, day, 12).getDay() === weekday) {
                        dates.add(getLocalDateKey(new Date(year, month, day, 12)));
                    }
                }
            }
        });
    }

    return [...dates].filter((date) => date >= startDate).sort();
}

export function expandICSRecurrence(startDate, rule, maxOccurrences = 366) {
    if (!startDate) return [];
    if (!rule) return [startDate];

    const parts = parseRecurrenceRule(rule);
    const frequency = parts.FREQ;
    const interval = Math.max(1, Number.parseInt(parts.INTERVAL || '1', 10) || 1);
    const count = Math.min(maxOccurrences, Math.max(1, Number.parseInt(parts.COUNT || String(maxOccurrences), 10) || maxOccurrences));
    const until = parts.UNTIL ? parseICSDate(parts.UNTIL) : null;
    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(frequency)) return [startDate];

    // Google and Apple commonly encode a multi-day weekly recurrence with
    // BYDAY (for example, FREQ=WEEKLY;BYDAY=MO,WE). Preserve those weekdays
    // instead of reducing the event to only its DTSTART weekday.
    if (frequency === 'WEEKLY' && parts.BYDAY) {
        const dayIndexes = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        const weekStartIndex = dayIndexes[parts.WKST] ?? dayIndexes.MO;
        const offsets = parts.BYDAY.split(',')
            .map((day) => dayIndexes[day.slice(-2)])
            .filter((day) => Number.isInteger(day))
            .map((day) => (day - weekStartIndex + 7) % 7)
            .sort((a, b) => a - b);
        if (offsets.length > 0) {
            const weekCursor = new Date(`${startDate}T12:00:00`);
            weekCursor.setDate(weekCursor.getDate() - ((weekCursor.getDay() - weekStartIndex + 7) % 7));
            const dates = [];
            while (dates.length < count) {
                for (const offset of offsets) {
                    const candidate = new Date(weekCursor);
                    candidate.setDate(candidate.getDate() + offset);
                    const date = getLocalDateKey(candidate);
                    if (date < startDate) continue;
                    if (until && date > until) return dates;
                    dates.push(date);
                    if (dates.length >= count) return dates;
                }
                weekCursor.setDate(weekCursor.getDate() + (7 * interval));
            }
            return dates;
        }
    }

    if (frequency === 'MONTHLY' && (parts.BYMONTHDAY || parts.BYDAY)) {
        const dates = [];
        let monthCursor = new Date(`${startDate}T12:00:00`);
        monthCursor.setDate(1);
        while (dates.length < count) {
            for (const date of monthlyRuleDates(monthCursor, parts, startDate)) {
                if (until && date > until) return dates;
                dates.push(date);
                if (dates.length >= count) return dates;
            }
            monthCursor = addCalendarMonths(monthCursor, interval);
        }
        return dates;
    }

    const dates = [];
    const anchor = new Date(`${startDate}T12:00:00`);
    const anchorDay = anchor.getDate();
    const anchorMonth = anchor.getMonth();
    const anchorYear = anchor.getFullYear();
    let cursor = new Date(anchor);
    for (let index = 0; index < count; index += 1) {
        if (index > 0 && frequency === 'MONTHLY') {
            cursor = new Date(anchor);
            cursor.setDate(1);
            cursor.setMonth(anchorMonth + (index * interval));
            cursor.setDate(Math.min(anchorDay, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()));
        }
        if (index > 0 && frequency === 'YEARLY') {
            cursor = new Date(anchor);
            cursor.setDate(1);
            cursor.setFullYear(anchorYear + (index * interval));
            cursor.setMonth(anchorMonth);
            cursor.setDate(Math.min(anchorDay, new Date(cursor.getFullYear(), anchorMonth + 1, 0).getDate()));
        }
        const date = getLocalDateKey(cursor);
        if (until && date > until) break;
        dates.push(date);
        if (frequency === 'DAILY') cursor.setDate(cursor.getDate() + interval);
        if (frequency === 'WEEKLY') cursor.setDate(cursor.getDate() + (7 * interval));
    }
    return dates;
}

/**
 * Converts a portable RFC 5545 calendar export into rows supported by the
 * existing date-based custom_events table. Recurring and multi-day events are
 * expanded into individual dated events so no schema migration is required.
 */
export function parseICSCalendar(icsText, { color = '#8b5cf6', maxOccurrences = 1000 } = {}) {
    if (!icsText || typeof icsText !== 'string') return [];

    const lines = unfoldICS(icsText).split(/\r?\n/);
    const rows = [];
    let event = null;
    const pushEvent = () => {
        if (!event) return;
        const title = unescapeICSValue(event.SUMMARY?.value || '').trim();
        const start = parseICSDate(event.DTSTART?.value);
        if (!title || !start || rows.length >= maxOccurrences) return;

        const recurrenceDates = expandICSRecurrence(start, event.RRULE?.value, maxOccurrences - rows.length);
        const excludedDates = new Set((event.EXDATE || [])
            .flatMap((property) => String(property.value || '').split(','))
            .map((value) => parseICSDate(value))
            .filter(Boolean));
        const end = event.DTEND ? parseICSDate(event.DTEND.value) : null;
        const endIsDateOnly = event.DTEND?.params?.VALUE === 'DATE' || /^\d{8}$/.test(event.DTEND?.value || '');
        const duration = end && end > start
            ? Math.max(0, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) - (endIsDateOnly ? 1 : 0))
            : 0;

        recurrenceDates.forEach((occurrence) => {
            if (excludedDates.has(occurrence)) return;
            for (let offset = 0; offset <= duration && rows.length < maxOccurrences; offset += 1) {
                rows.push({ title, event_date: addCalendarDays(occurrence, offset), color });
            }
        });
    };

    lines.forEach((line) => {
        const upper = line.toUpperCase();
        if (upper === 'BEGIN:VEVENT') {
            event = {};
            return;
        }
        if (upper === 'END:VEVENT') {
            pushEvent();
            event = null;
            return;
        }
        if (!event) return;
        const property = parseICSProperty(line);
        if (property && ['SUMMARY', 'DTSTART', 'DTEND', 'RRULE', 'EXDATE'].includes(property.name)) {
            if (property.name === 'EXDATE') {
                event.EXDATE = [...(event.EXDATE || []), property];
            } else {
                event[property.name] = property;
            }
        }
    });
    return rows;
}

export function buildCustomEventPayload({ userId, title, eventDate, color = '#8b5cf6' } = {}) {
    const cleanTitle = String(title || '').trim();
    const cleanDate = String(eventDate || '').slice(0, 10);
    if (!userId) throw new Error('Please sign in before adding calendar events.');
    if (!cleanTitle) throw new Error('Event title is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) throw new Error('A valid event date is required.');
    if (!isValidISODate(cleanDate)) {
        throw new Error('A valid event date is required.');
    }
    return { user_id: userId, title: cleanTitle, event_date: cleanDate, color: color || '#8b5cf6' };
}

export function buildCustomEventRows({ userId, title, startDate, endDate, color = '#8b5cf6' } = {}) {
    const firstDate = String(startDate || '').slice(0, 10);
    const lastDate = String(endDate || firstDate).slice(0, 10);
    if (!isValidISODate(firstDate) || !isValidISODate(lastDate) || lastDate < firstDate) {
        throw new Error('End date must be on or after the start date.');
    }
    const rows = [];
    let cursor = firstDate;
    while (cursor <= lastDate) {
        if (rows.length >= 366) throw new Error('Calendar events can span at most 366 days.');
        rows.push(buildCustomEventPayload({ userId, title, eventDate: cursor, color }));
        cursor = addCalendarDays(cursor, 1);
    }
    return rows;
}

/**
 * Generates an RFC 5545 compliant VCALENDAR (.ics) string from event objects.
 */
export function generateICSString(events = [], calendarName = "DueVinci Master Schedule") {
    let ics = "BEGIN:VCALENDAR\r\n";
    ics += "VERSION:2.0\r\n";
    ics += "PRODID:-//DueVinci//Student Command Center//EN\r\n";
    ics += "CALSCALE:GREGORIAN\r\n";
    ics += `X-WR-CALNAME:${calendarName}\r\n`;
    ics += "X-WR-TIMEZONE:UTC\r\n";

    const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    events.forEach((ev, idx) => {
        if (!ev.date && !ev.start) return;
        const rawDate = (ev.date || ev.start || '').split('T')[0];
        const dateFormatted = rawDate.replace(/-/g, '');
        const uid = ev.id ? `duevinci-${ev.id}@duevinci.tech` : `duevinci-${dateFormatted}-${idx}@duevinci.tech`;
        const title = (ev.title || 'Academic Event').replace(/[\\,;]/g, ' ');
        const desc = (ev.description || ev.course || 'DueVinci Academic Planner').replace(/[\\,;]/g, ' ');

        ics += "BEGIN:VEVENT\r\n";
        ics += `UID:${uid}\r\n`;
        ics += `DTSTAMP:${nowStr}\r\n`;
        ics += `DTSTART;VALUE=DATE:${dateFormatted}\r\n`;
        // RFC 5545 all-day DTEND values are exclusive, so a one-day event
        // ends on the following date when another calendar imports it.
        ics += `DTEND;VALUE=DATE:${addCalendarDays(rawDate, 1).replace(/-/g, '')}\r\n`;
        ics += `SUMMARY:${title}\r\n`;
        ics += `DESCRIPTION:${desc}\r\n`;
        ics += "STATUS:CONFIRMED\r\n";
        ics += "END:VEVENT\r\n";
    });

    ics += "END:VCALENDAR\r\n";
    return ics;
}

export function initCalendar() {
    if (typeof document === 'undefined') return;
    if (calendarInstance) return;
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || typeof FullCalendar === 'undefined') return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        timeZone: 'local',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: [],
        dayMaxEvents: true,
        eventClick: async function(info) {
            if (info.event.extendedProps.isCustom) {
                if (confirm(`Delete custom event "${info.event.title}"?`)) deleteCustomEvent(info.event.extendedProps.eventId);
            } else if (info.event.extendedProps.isAssignment) {
                const assignId = info.event.extendedProps.assignmentId;
                const newState = !info.event.extendedProps.isCompleted;
                await supabaseClient.from('assignments').update({ is_completed: newState }).eq('id', assignId);
                if (newState) fireConfetti();
                loadCalendarCourses();
            }
        }
    });
    calendarInstance.render();
}

export async function loadCalendarCourses() {
    if (typeof document === 'undefined') return;
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    const { data: customEvents } = await supabaseClient.from('custom_events').select('*');

    let calendarEvents = [];
    const courseMap = {};
    if (courses) courses.forEach(c => courseMap[c.id] = c);

    if (assignments) assignments.forEach(assign => {
        const course = courseMap[assign.course_id];
        if (!course) return;
        const prefix = assign.unit_number ? `[Wk ${assign.unit_number}] ` : '';
        calendarEvents.push({
            title: `${course.emoji || '📚'} ${prefix}${assign.title}`,
            start: assign.due_date,
            color: assign.is_completed ? '#9ca3af' : course.color,
            extendedProps: { isAssignment: true, assignmentId: assign.id, isCompleted: assign.is_completed }
        });
    });

    if (customEvents) customEvents.forEach(ev => {
        calendarEvents.push({ title: ev.title, start: ev.event_date, color: ev.color, extendedProps: { isCustom: true, eventId: ev.id } });
    });

    // Planned focus blocks are separate from due dates: they show when the
    // student intends to work, without changing the assignment itself.
    if (courses && assignments) {
        const plan = generateBalancedStudyPlan(courses, assignments, new Date(), 21);
        let syncedMoves = [];
        if (currentUser?.id) {
            const { data } = await supabaseClient.from('study_plan_moves')
                .select('task_id, planned_for')
                .eq('user_id', currentUser.id);
            syncedMoves = data || [];
        }
        const remoteMoveByTask = new Map(syncedMoves.filter((move) => move.planned_for).map((move) => [move.task_id, move.planned_for]));
        plan.forEach((day) => day.allBlocks.forEach((block) => {
            const plannedFor = remoteMoveByTask.get(block.taskId) || day.date;
            calendarEvents.push({
                title: `🧠 Study · ${block.courseCode}: ${block.title}`,
                start: plannedFor,
                color: '#6366f1',
                textColor: '#ffffff',
                extendedProps: { isStudyPlan: true, taskId: block.taskId, durationMinutes: block.durationMinutes },
            });
        }));
    }

    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(calendarEvents);
    }
}

export async function openEventModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('eventModal');
    if (modal) {
        if (modal.classList.contains('hidden')) lastEventModalTrigger = document.activeElement;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        if (modal.dataset.a11yBound !== 'true') {
            modal.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeEventModal();
                    return;
                }
                if (event.key !== 'Tab') return;
                const focusable = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
                    .filter((element) => !element.disabled && element.offsetParent !== null);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            });
            modal.dataset.a11yBound = 'true';
        }
        const focusEventTitle = () => document.getElementById('eventTitle')?.focus();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusEventTitle);
        else focusEventTitle();
    }
    const courseSelect = document.getElementById('eventCourseSelect');
    if (courseSelect) {
        try {
            const { data: courses } = await supabaseClient.from('courses').select('id,code,emoji,color').order('code', { ascending: true });
            courseSelect.innerHTML = '<option value="">General / None</option>' + (courses || []).map((course) =>
                `<option value="${escapeHtml(course.id)}" data-color="${escapeHtml(course.color || '')}">${escapeHtml(course.emoji || '📚')} ${escapeHtml(course.code || 'Untitled class')}</option>`
            ).join('');
        } catch (error) {
            console.warn('Calendar course lookup notice:', error);
        }
    }
}

export function closeEventModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('eventModal');
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
    if (lastEventModalTrigger && typeof lastEventModalTrigger.focus === 'function') lastEventModalTrigger.focus();
    lastEventModalTrigger = null;
}

export async function deleteCustomEvent(id) {
    await supabaseClient.from('custom_events').delete().eq('id', id);
    loadCalendarCourses();
}

export function exportToICS() {
    if (!calendarInstance) return;
    const events = calendarInstance.getEvents().map(ev => ({
        title: ev.title,
        start: ev.start ? getLocalDateKey(ev.start) : null
    }));
    const icsContent = generateICSString(events);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'duevinci-schedule.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function importICSFile(input) {
    const file = input?.files?.[0];
    if (!file) return;

    const user = await getCalendarUser();
    if (!user) {
        setImportStatus('Please sign in before importing a calendar.', 'error');
        input.value = '';
        return;
    }

    input.disabled = true;
    setImportStatus(`Reading ${file.name || 'calendar'}…`);
    try {
        const icsText = typeof file.text === 'function'
            ? await file.text()
            : new TextDecoder().decode(await file.arrayBuffer());
        const parsedEvents = parseICSCalendar(icsText);
        if (parsedEvents.length === 0) throw new Error('No dated events were found in this .ics file.');

        const seen = new Set();
        const uniqueRows = parsedEvents.filter((event) => {
            const key = `${String(event.title || '').trim().toLocaleLowerCase()}\u0000${event.event_date}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const { data: existingEvents, error: existingError } = await supabaseClient
            .from('custom_events')
            .select('title,event_date')
            .eq('user_id', user.id);
        if (existingError) throw existingError;
        const existingKeys = new Set((existingEvents || []).map((event) =>
            `${String(event.title || '').trim().toLocaleLowerCase()}\u0000${event.event_date}`));
        const rows = uniqueRows
            .filter((event) => !existingKeys.has(`${String(event.title || '').trim().toLocaleLowerCase()}\u0000${event.event_date}`))
            .map((event) => ({ ...event, user_id: user.id }));
        const skipped = parsedEvents.length - rows.length;
        const preview = rows.slice(0, 8).map((event) => `• ${event.event_date} — ${event.title}`).join('\n');
        const more = rows.length > 8 ? `\n• +${rows.length - 8} more` : '';
        const decision = window.confirm(`Review ${file.name || 'calendar'} before importing:\n\nNew events: ${rows.length}\nSkipped duplicates: ${skipped}${preview ? `\n\n${preview}${more}` : ''}\n\nImport these events?`);
        if (!decision) {
            setImportStatus('Calendar import canceled.', 'muted');
            input.value = '';
            return;
        }
        if (rows.length === 0) {
            setImportStatus(`No new events found. Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`, 'muted');
            input.value = '';
            return;
        }
        const { error } = await supabaseClient.from('custom_events').insert(rows);
        if (error) throw error;

        setImportStatus(`Imported ${rows.length} new event${rows.length === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}.`, 'success');
        input.value = '';
        await loadCalendarCourses();
    } catch (error) {
        console.error('Calendar import error:', error);
        setImportStatus(error.message || 'Could not import this calendar file.', 'error');
        input.value = '';
    } finally {
        input.disabled = false;
    }
}

export async function saveCustomEvent(event) {
    if (event) event.preventDefault();
    const form = event?.currentTarget || document.getElementById('customEventForm');
    const submitButton = form?.querySelector('button[type="submit"]');
    const status = document.getElementById('customEventStatus');
    const title = document.getElementById('eventTitle')?.value;
    const startDate = document.getElementById('eventStartDate')?.value;
    const endDate = document.getElementById('eventEndDate')?.value || startDate;
    const selectedCourse = document.getElementById('eventCourseSelect')?.selectedOptions?.[0];
    const color = selectedCourse?.dataset?.color || '#8b5cf6';

    if (submitButton) submitButton.disabled = true;
    if (status) status.textContent = 'Saving…';
    try {
        const user = await getCalendarUser();
        if (!user) throw new Error('Please sign in before adding calendar events.');
        const rows = buildCustomEventRows({ userId: user.id, title, startDate, endDate, color });
        const { error } = await supabaseClient.from('custom_events').insert(rows);
        if (error) throw error;

        if (status) status.textContent = '';
        form?.reset();
        closeEventModal();
        await loadCalendarCourses();
    } catch (error) {
        console.error('Custom calendar event error:', error);
        if (status) status.textContent = error.message || 'Could not save this event.';
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

// Bind to window & globalThis for testing and HTML inline handlers
const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.generateICSString = generateICSString;
_scope.initCalendar = initCalendar;
_scope.loadCalendarCourses = loadCalendarCourses;
_scope.openEventModal = openEventModal;
_scope.closeEventModal = closeEventModal;
_scope.deleteCustomEvent = deleteCustomEvent;
_scope.exportToICS = exportToICS;
_scope.importICSFile = importICSFile;
_scope.parseICSCalendar = parseICSCalendar;
_scope.saveCustomEvent = saveCustomEvent;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const customEventForm = document.getElementById('customEventForm');
        if (customEventForm) {
            customEventForm.addEventListener('submit', saveCustomEvent);
        }
    });
}
