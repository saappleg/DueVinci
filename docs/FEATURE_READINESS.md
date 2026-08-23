# Feature readiness (Dev)

This is the operational map for the Dev environment. It distinguishes account
data that is stored in Supabase from intentionally device-local preferences.

| Area | Storage / service | Ready state |
| --- | --- | --- |
| Authentication and account identity | Supabase Auth and `profiles` | Account-scoped by RLS. |
| Courses, terms, notes, resources, and completion | `courses` | Synced per account. |
| Assignments, grades, due dates, type, priority, and completion | `assignments` | Synced per account. `task_type`, `type`, and `priority` are in migration `20260823135000_assignment_metadata.sql`. |
| Calendar events | `custom_events` | Synced per account. |
| Dashboard, grades, calendar, and study plan | Reads the course and assignment data above | No separate copy of academic data. |
| Export/import backup | Supabase academic data plus device preferences | Export is a recovery/transfer tool, not a replacement for RLS-protected sync. |
| Support form | `support_tickets` | Submitted with the signed-in user ID. |
| Account deletion | `delete-account` Edge Function | Deletes the Canvas connection then the authenticated user. Test only with a disposable account. |
| AI syllabus import | Shared `gemini-parser` Edge Function | Dev deliberately uses the active function supplied from the main integration; do not replace it during Dev work. |
| Canvas connection and sync | Server-only `canvas_connections` and Canvas Edge Functions | Dev-only paid integration. Tokens are AES-GCM encrypted at rest and never returned to the browser. |
| Subscription and billing | Stripe plus billing Edge Functions | Dev uses Stripe Test credentials and the Dev Supabase project only. |

## Intentionally device-local

The following are browser preferences or live session state, not shared account
records: visual theme, date and GPA display settings, alarm/audio choices,
Pomodoro/custom timer state, rest days, flashcard mastery, installation-banner
dismissal, tour state, and a few convenience UI choices (such as hidden
sections). They are included in the JSON backup where applicable.

This is a product choice, not a broken Supabase link. If cross-device sync for
these preferences becomes a requirement, add a RLS-protected `user_preferences`
table and migrate them deliberately; do not store them in `profiles`, which is
also used for protected billing state.

## PWA readiness

- The worker is registered from the manifest directory, so it works from the
  dashboard and nested routes.
- The core application shell and modules are pre-cached. Optional cache misses
  no longer stop installation.
- Authenticated Supabase/API responses are never cached by the worker.
- The installed app can open its cached shell offline after a successful online
  load. Saving, syncing, and account changes still require a connection;
  DueVinci does **not** currently queue offline mutations.

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

For subscription/Canvas promotion checks, use
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) and `npm run verify:production-release`.
