# Calendar & Schedule Sync 📅

The calendar (`js/modules/calendar.js`) displays coursework deadlines, custom/imported events, and planned study blocks using FullCalendar.

## Views and interaction

- Use **Month** or **Week**, Previous/Next, and Today.
- Click coursework to toggle completion. Planned study blocks show when to work without changing the assignment's due date.
- Click a custom/imported event to open its actions, create an assignment, or delete the event.

The current toolbar does not expose Day/List views or drag-and-drop rescheduling. Imported/manual events are stored as dates, not a complete timed-calendar model.

## Free .ics import and export

Calendar → **Import .ICS** reads a file exported by Google Calendar, Apple Calendar, Outlook, or another compatible tool. The import:

- Expands supported daily/weekly/monthly/yearly recurrence patterns and multi-day ranges within a bounded row count.
- Honors common `EXDATE` date exceptions.
- Skips case-insensitive title/date duplicates within the file and existing events.
- Shows a native confirmation with counts and a preview before saving.

This is support for common calendar exports, not every RFC 5545 feature. Dates are preserved as date-based rows; arbitrary timezone/time-of-day and provider-specific behavior should be reviewed after import.

**Export .ICS** downloads currently loaded coursework, events, and study blocks as all-day entries. A one-day entry uses an exclusive next-day `DTEND`:

```text
BEGIN:VEVENT
UID:duevinci-example@duevinci.tech
DTSTART;VALUE=DATE:20261020
DTEND;VALUE=DATE:20261021
SUMMARY:Fictional study review
END:VEVENT
```

Files are portable snapshots, not two-way provider synchronization. Pro also offers read-only Google Calendar and Outlook connections after the provider OAuth applications and callback are configured: the first sync runs after connection, and users start later syncs. These providers do not receive DueVinci changes; see the [calendar integration runbook](../docs/CALENDAR_INTEGRATIONS.md) for scopes and configuration.

## Create coursework from an event

1. Open a custom/imported event.
2. Choose a class whose class/term date window includes the event date.
3. Select **Create assignment**.

DueVinci keeps the original event, checks matching class/title/date assignments, and uses the source event ID to prevent repeat conversion across devices. Errors leave the event available. The resulting assignment can participate in the free study planner. This explicit action is separate from provider synchronization.

## SNHU Brightspace calendar sync · Pro

In Settings → Subscription, eligible accounts can connect the private HTTPS Calendar Feed from SNHU Brightspace. The backend accepts the supported SNHU calendar URL, encrypts the saved link, and imports calendar events/due dates. It does not automatically create course records or planner assignments. Use the explicit conversion above when appropriate.

- **Sync now** refreshes the saved feed; disconnect removes the saved connection while previously imported entries remain.
- Successful sync marks older entries from that user's Brightspace feed inactive, including after a valid empty feed.
- Malformed event/task blocks are rejected before persistence. Fetch/write failures are reported; a write failure prevents retirement of older feed entries. The multi-batch save is not a single database transaction.
- Manual events and other users/providers are outside the stale-entry update scope.

Treat the private feed URL like a credential; never post it in issues or logs. Calendar sync does not provide clinical documentation or patient-care functionality. Nursing-related examples must stay fictional.
