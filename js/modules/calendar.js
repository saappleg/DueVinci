// --- FULLCALENDAR & ICS EXPORT MODULE ---
import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { fireConfetti, getLocalDateKey } from './utils.js';
import { generateBalancedStudyPlan } from './studyPlan.js';

export let calendarInstance = null;

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
        ics += `DTEND;VALUE=DATE:${dateFormatted}\r\n`;
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

export function openEventModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('eventModal')?.classList.remove('hidden');
}

export function closeEventModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('eventModal')?.classList.add('hidden');
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

// Bind to window & globalThis for testing and HTML inline handlers
const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.generateICSString = generateICSString;
_scope.initCalendar = initCalendar;
_scope.loadCalendarCourses = loadCalendarCourses;
_scope.openEventModal = openEventModal;
_scope.closeEventModal = closeEventModal;
_scope.deleteCustomEvent = deleteCustomEvent;
_scope.exportToICS = exportToICS;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const customEventForm = document.getElementById('customEventForm');
        if (customEventForm) {
            customEventForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await supabaseClient.from('custom_events').insert([{
                    user_id: currentUser?.id,
                    title: document.getElementById('evTitle').value,
                    event_date: document.getElementById('evDate').value,
                    color: document.getElementById('evColor').value
                }]);
                document.getElementById('evTitle').value = '';
                closeEventModal();
                loadCalendarCourses();
            });
        }
    });
}
