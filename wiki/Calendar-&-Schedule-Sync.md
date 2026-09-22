# Calendar & Schedule Sync 📅

DueVinci includes an interactive **Academic Calendar** (`js/modules/calendar.js`) powered by FullCalendar, integrating course schedules, assignment deadlines, office hours, and personal milestones into a unified timeline.

---

## 🗓️ Views & Interaction

- **Month View**: Bird's-eye view of high-level milestone deadlines and major exam dates.
- **Week / Day Agenda**: Granular hourly schedule displaying class times, study blocks, and due dates.
- **List / Schedule View**: Chronological agenda view ideal for mobile screens and quick reviews.
- **Drag-and-Drop Rescheduling**: Drag an assignment or study block to any date/time to instantly update its due date across your entire workspace.

---

## 📥 RFC 5545 iCalendar (.ics) Import & Export

DueVinci allows one-click export of all coursework deadlines and import of calendar files from:
- **Apple Calendar** (macOS / iOS)
- **Google Calendar**
- **Microsoft Outlook**
- **Notion Calendar / Cron**

Imports are reviewed before saving. DueVinci expands recurring and multi-day events,
honors common `EXDATE` exceptions, skips matching title/date duplicates, and keeps
the free planner usable without provider credentials. Manual events support one-day
or multi-day date ranges and can use a class color.

Live background synchronization with Google, Microsoft, or Apple accounts is a
separate DueVinci Pro roadmap item. It requires provider OAuth credentials and
scopes; an exported `.ics` file is not two-way synchronization.

```mermaid
flowchart LR
    DueVinci[DueVinci Academic DB] --> ICSGenerator[js/modules/calendar.js: generateICS()]
    ICSGenerator --> ICSFile[academic_calendar.ics]
    ICSFile --> GCal[Google Calendar]
    ICSFile --> AppleCal[Apple Calendar]
    ICSFile --> Outlook[Microsoft Outlook]
    GCalExport[Google / Apple / Outlook export] --> ICSImport[DueVinci .ics review + dedupe]
    ICSImport --> DueVinci
```

### Generated iCalendar Format Example
```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DueVinci//Academic Workspace//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:dv-assignment-9428-cs101
DTSTAMP:20260821T060000Z
DTSTART:20260915T235900
SUMMARY:[CS 101] Problem Set 1
DESCRIPTION:Algorithms and asymptotic notation review.
CATEGORIES:Homework Assignments
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR
```
