# Feature readiness (Dev)

This is the operational map for the Dev environment. It distinguishes account
data stored in Supabase from the local cache that makes the free planner usable
offline.

| Area | Storage / service | Ready state |
| --- | --- | --- |
| Authentication and account identity | Supabase Auth and `profiles` | Account-scoped by RLS. |
| Courses, term labels, notes, resources, and completion | `courses`; named term/date preferences also use `user_preferences` | Synced per account. |
| Assignments, grades, due dates, type, priority, completion, and gradebook inclusion | `assignments` | Synced per account. Students explicitly choose which coursework appears in Grades; migration `20261017064026_assignment_gradeability.sql` adds the saved flag and preserves rows with existing grades or category assignments. |
| Coursework workflow fields | `assignments` parent IDs, progress, instructions, and checklist metadata | Recurring coursework, subtasks, partial progress, and editable checklist drafts require migration `20261017022939_coursework_workflow_fields.sql`. |
| Grade settings | Course grade-category/credit fields and assignment category/exclusion fields | Weighted categories, credit-weighted GPA estimates, target-score calculations, and grade insights require migration `20261017022938_weighted_gradebook_and_gpa.sql`. |
| Calendar events | `custom_events` | Synced per account. Manual one-day/multi-day events and reviewed `.ics` imports are supported; imports expand common recurrence rules, honor `EXDATE`, and skip matching title/date duplicates. A student can manually convert an event to a linked assignment after choosing a class; the original event stays on the calendar. A valid empty Brightspace feed marks that provider's older imported rows inactive, while malformed or failed feeds do not retire them. |
| Google Calendar and Outlook | Server-only `calendar_connections` and `calendar_oauth_states`; provider events in `custom_events` | Pro, read-only sync of the primary/default calendar. The first sync runs after connection; users start later syncs. Imports event title and date for the previous 30 days through the next 180 days. OAuth tokens and PKCE verifiers are encrypted server-side; disconnect hides imported events. Requires provider OAuth apps, callback registration, secrets, migration, and function deployment. |
| Dashboard, grades, calendar, and study plan | Reads the course and assignment data above | No separate copy of academic data. Dashboard completion totals and Weekly Review count every assignment row; the due-date radar counts actual incomplete items, including deadlines on rest days, while Smart Study Plan schedules work around rest days. Up Next includes titled, dated coursework across categories. Grades includes only selected coursework. The **Hide completed classes** preference also removes completed courses from grade cards, cumulative GPA, and term insights. |
| Term rollover | `courses` plus the synced term preferences | Copies course setup only to a new term, leaves the source term unchanged, and uses the source course ID for retry-safe copies. Assignments and lesson progress are not copied. |
| Export/import backup | Supabase courses, assignments, calendar events, synced preferences, and flashcard mastery; timers from the current device | Plain JSON recovery/transfer tool, not encrypted and not a replacement for RLS-protected sync. Restore upserts records present in the file; it does not delete cloud records missing from the backup and may partially complete if a later table fails. |
| Flashcard mastery | `flashcard_mastery` plus account-scoped localStorage | RLS-protected cloud row; authenticated writes atomically merge per-card review timestamps. Offline edits remain local and sync on reconnect or next authenticated launch. Backups include only the current account's local mastery and cloud rows. Unscoped progress from older app versions is not automatically attributed to an account. |
| Nursing Hub workspace | Account-scoped `duevinci_workspace_nursing_hub_<user-id>` localStorage plus the signed-in user's `user_preferences` row | Opt-in and local-first. Validated workspace data syncs while online; disabling the Hub hides it and keeps drafts. Quick-review session state is temporary and derives its queue from saved flashcard, dosage, and anatomy progress. Keep real patient information out of all Nursing fields. |
| Study-plan calibration history | `duevinci_study_history` in localStorage and the signed-in user's `user_preferences` row | Opt-in DueVinci Pro feature. Records task/course IDs, task type, focused or self-reported minutes, and timestamps. Self-reports remain separate from focus-session counts and minutes. Completing coursework successfully records study activity for the streak regardless of this opt-in; Daily Brief time estimates enter history only when enabled. Turning it off pauses new capture but keeps saved history. Estimates use records from the previous 90 days; that window is not an automatic deletion period. Each save retains the newest 180 focus sessions, 120 completions, and 120 self-reports; older entries may be dropped. The user can clear history in Settings. |
| Canvas coursework refresh and grade alerts | `canvas_connections`, server-only `canvas_grade_snapshots`, per-device `push_subscriptions`, and the push delivery log | Pro Canvas sync directly imports dated assignments for selected courses without per-row review. The opt-in worker checks every minute and claims one account per invocation; each account is normally checked at most about hourly, plus existing manual sync. Alerts cover new assignments, changed due dates, and changed grades Canvas marks posted for the current submission. Initial grade observation is a baseline. Requires Vault scheduler secrets and Web Push setup. |
| Tutor usage and course grounding | `tutor_usage_monthly`; selected course description, objectives, notes, and up to 20 assignment titles and due dates | Users can read their own aggregate counts; only service-role functions can reserve or release requests. Selected course material is sent with the Tutor question; returned excerpts are checked against that text and shown with the reply. The interface identifies replies without a supporting course source. Conversation history stays on the current page. The daily cleanup deletes usage rows whose last update is more than 12 months old. |
| Support form and inbox | `support_tickets` | Submitted with the signed-in user ID; resolved/closed tickets are automatically deleted 90 days after resolution. |
| Browser diagnostics | `app_error_events` | Captures client error reports server-side; events are automatically deleted after 90 days. |
| User preferences | `user_preferences` plus local cache | Theme, timer, display, reminder, and similar settings sync across signed-in devices. The optional study history is described separately above because it contains task IDs, focus minutes, and timestamps. |
| Account deletion | Settings plus `delete-account` Edge Function | Removes core academic rows and Canvas credentials before deleting Auth; flashcard mastery, Tutor usage, and synced preferences (including study history) cascade with the user. Clears browser storage on the browser performing deletion; offline copies on other devices require clearing that device's browser storage. Test only with a disposable account. |
| AI syllabus import | `gemini-parser` Edge Function in the configured project | Localhost/127.0.0.1 use the configured Dev project. Coordinate changes to the existing Dev function before replacing it; frontend publication does not deploy Edge Functions. |
| Canvas connection and sync | Server-only `canvas_connections` and Canvas Edge Functions | Paid integration; exercise it against the configured Dev project for development checks. Tokens are AES-GCM encrypted at rest and never returned to the browser. |
| Subscription and billing | Stripe plus billing Edge Functions | Dev uses Stripe Test credentials and the Dev Supabase project only. |

## Local cache and synchronized preferences

The browser keeps a per-user IndexedDB/localStorage cache for offline planner
use. Flashcard mastery uses account-scoped localStorage keys and is queued for
cloud merge on reconnect. This is a cache—not a replacement for the RLS-protected
cloud record. Backups are plain JSON files and are not encrypted by DueVinci.
Settings synchronize through the RLS-protected `user_preferences` table.
If Pro study-plan calibration is enabled, that row also syncs its optional
task/course IDs, focused and self-reported minutes, task types, and timestamps.
It retains up to 180 focus sessions, 120 completions, and 120 self-reports per
save. The app calculates estimates from the previous 90 days but does not delete history on that schedule;
the user can clear it in Settings. Live session state, installation-banner
dismissal, and tour state can remain local.

## PWA readiness

- On hosted origins, the worker is registered from the manifest directory, so
  it works from the dashboard and nested routes. On `localhost`, `127.0.0.1`,
  and IPv6 loopback, DueVinci skips registration and unregisters only its own
  matching worker to avoid stale local previews. An already controlled preview
  may need a reload after cleanup; unrelated workers and planner storage remain.
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

Before a release, manually verify installation and an offline reload on a hosted
test environment in Chrome or on a phone, after visiting the dashboard, Courses,
Grades, and Calendar once while online. Loopback previews do not test worker
installation. Configure the intended test backend explicitly: the checked-in
client chooses Dev for localhost/127.0.0.1 and Production for other hosts.

## Dev verification checklist

1. Sign in with two accounts and confirm each sees only its own academic data.
2. Create, edit, complete, grade, and delete a course/assignment; confirm the
   change appears after a refresh and on a second signed-in device. Rate different
   flashcards on two devices and confirm both card updates survive; verify a second
   account on the same browser cannot see or export the first account's mastery.
3. Add and remove a calendar event; export and re-import a backup using a
   disposable account. Test an `.ics` file with a recurrence, an `EXDATE`, a
   multi-day event, and a duplicate to confirm the review step behaves as expected.
   Convert a calendar event to an assignment and confirm the event remains; retry
   the action and confirm it does not create a second assignment.
4. Exercise AI import with the shared `gemini-parser` function, if its API key
   is configured.
5. Use the Dev Canvas mock to connect, select courses, and sync assignments.
6. For Dev Brightspace sync, confirm a valid empty feed deactivates older imported
   provider events, while a malformed feed or failed fetch leaves them intact.
   Confirm another user's and manual calendar events are unaffected.
7. Roll over a named term and confirm only course setup is copied, the old term
   remains unchanged, and repeating the action does not duplicate courses.
8. With an entitled Pro test account, enable study-plan calibration and Canvas
   change alerts. Confirm study history is opt-in, its estimates use the previous
   90 days, clearing history syncs the removal, and Canvas alerts arrive only
   after sync for new assignments or changed due dates.
9. Test PWA install and offline reload as described above. Review a flashcard
   while offline, reconnect, and confirm the pending mastery merge completes
   before relying on the second-device copy.
10. Mark a test support ticket resolved and confirm it remains visible before the
   90-day retention window; check the Supabase Cron job for scheduled cleanup.
11. Change a preference on one signed-in device and confirm it appears on a
   second device.
12. Enable the Nursing Hub on a test account, review the due/unfinished queue,
   complete one item from each available tool, and confirm the existing progress
   records save locally and sync to the same account.
13. Open Settings from the dashboard and Nursing page, switch sections, close
    with Escape, and scroll the modal in both light and dark degree themes.
    Check narrow screens for readable text and controls.
14. In a disposable course week, confirm Up Next includes dated Discussion
    coursework with its type, Dashboard and Weekly Review completion totals
    agree, the radar still shows actual due dates on rest days, and the study
    plan honors rest days for scheduled work. Complete a Daily Brief item
    without a timer; verify the streak updates, the optional estimate is
    suppressed after a same-device linked focus session that day, and entered
    minutes enter study history only with Pro personalization enabled without
    changing focus-session totals.

For subscription/Canvas promotion checks, use
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) and `npm run verify:production-release`.
