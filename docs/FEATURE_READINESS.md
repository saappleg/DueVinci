# Feature readiness (Dev)

This is the operational map for the Dev environment. It distinguishes account
data stored in Supabase from the local cache that makes the free planner usable
offline.

| Area | Storage / service | Ready state |
| --- | --- | --- |
| Authentication and account identity | Supabase Auth and `profiles` | Account-scoped by RLS. |
| Courses, terms, notes, resources, and completion | `courses` | Synced per account. |
| Assignments, grades, due dates, type, priority, and completion | `assignments` | Synced per account. `task_type`, `type`, and `priority` are in migration `20260823135000_assignment_metadata.sql`. |
| Calendar events | `custom_events` | Synced per account. |
| Dashboard, grades, calendar, and study plan | Reads the course and assignment data above | No separate copy of academic data. |
| Export/import backup | Supabase academic data plus device preferences | Export is a recovery/transfer tool, not a replacement for RLS-protected sync. |
| Support form and inbox | `support_tickets` | Submitted with the signed-in user ID; resolved/closed tickets are automatically deleted 90 days after resolution. |
| Browser diagnostics | `app_error_events` | Captures client error reports server-side; events are automatically deleted after 90 days. |
| Non-sensitive preferences | `user_preferences` plus local cache | Theme, timer, display, and similar preferences sync across signed-in devices. |
| Account deletion | `delete-account` Edge Function | Deletes the Canvas connection then the authenticated user. Test only with a disposable account. |
| AI syllabus import | Shared `gemini-parser` Edge Function | Dev deliberately uses the active function supplied from the main integration; do not replace it during Dev work. |
| Canvas connection and sync | Server-only `canvas_connections` and Canvas Edge Functions | Dev-only paid integration. Tokens are AES-GCM encrypted at rest and never returned to the browser. |
| Subscription and billing | Stripe plus billing Edge Functions | Dev uses Stripe Test credentials and the Dev Supabase project only. |

## Local cache and synchronized preferences

The browser keeps a per-user IndexedDB/localStorage cache for offline planner
use. It is a cache—not a replacement for the RLS-protected cloud record.
Non-sensitive settings such as theme, timer preferences, rest days, and display
choices synchronize through the RLS-protected `user_preferences` table. Live
session state, installation-banner dismissal, and tour state can remain local.

## PWA readiness

- The worker is registered from the manifest directory, so it works from the
  dashboard and nested routes.
- The core application shell and modules are pre-cached. Optional cache misses
  no longer stop installation.
- Authenticated Supabase/API responses are never cached by the worker.
- The installed app can open its cached shell offline after a successful online
  load. Courses, assignments, grades, completion changes, and calendar events
  are cached per signed-in user and changes made offline are queued in
  IndexedDB for replay after reconnecting.
- Canvas, billing, AI import, account deletion, support requests, and other
  server-side operations remain online-only. Do not assume an offline write is
  fully synced until the reconnection notice clears.

Before a release, manually verify installation and an offline reload in Chrome
or on a phone after visiting the dashboard, Courses, Grades, and Calendar once
while online.

## Dev verification checklist

1. Sign in with two accounts and confirm each sees only its own academic data.
2. Create, edit, complete, grade, and delete a course/assignment; confirm the
   change appears after a refresh and on a second signed-in device.
3. Add and remove a calendar event; export and re-import a backup using a
   disposable account.
4. Exercise AI import with the shared `gemini-parser` function, if its API key
   is configured.
5. Use the Dev Canvas mock to connect, select courses, and sync assignments.
6. Test PWA install and offline reload as described above.
7. Mark a test support ticket resolved and confirm it remains visible before the
   90-day retention window; check the Supabase Cron job for scheduled cleanup.
8. Change a preference on one signed-in device and confirm it appears on a
   second device.

For subscription/Canvas promotion checks, use
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) and `npm run verify:production-release`.
