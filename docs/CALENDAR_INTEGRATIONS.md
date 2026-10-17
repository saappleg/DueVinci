# Calendar connections and scheduled Canvas refresh

This runbook describes the Pro calendar and Canvas integrations added by
`20261017022955_calendar_oauth_canvas_auto_sync.sql`. It is an implementation
guide; do not treat a source change as proof that a provider OAuth app, project
secret, scheduled job, or deployed Edge Function is configured.

## Google Calendar and Outlook

Both connections are read-only and sync the provider's default calendar once
after a successful OAuth return, then again whenever the user starts a sync. The
sync window includes
the previous 30 days and the next 180 days. Recurring events are expanded by
the providers. A sync supports up to 5,000 events and fails without deactivating
previous entries if a provider response is incomplete or fails.

DueVinci requests only event title and start date. It does not import event
descriptions, locations, attendees, or attachments. The event rows store the
provider event ID and source marker so repeated syncs update the same rows. A
successful complete sync marks older rows from that same provider inactive;
they remain stored but are hidden from the calendar. Disconnect deletes the
encrypted provider tokens and hides the provider's imported rows.

Sync and disconnect actions are serialized per provider. An overlapping action
receives a retry message, and abandoned claims expire after ten minutes.

| Provider | Authorization requested | API used |
| --- | --- | --- |
| Google Calendar | `https://www.googleapis.com/auth/calendar.events.owned.readonly` | Primary calendar `events.list`, with recurring instances expanded |
| Microsoft Outlook | `Calendars.ReadBasic offline_access` | Default calendar `calendarView` |

Google documents the owned-calendar read scope and `events.list` parameters in
its [events.list reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).
Microsoft lists `Calendars.ReadBasic` as the least-privileged permission for
[calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0).
Microsoft's [authorization-code flow documentation](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
describes PKCE and refresh-token replacement. Supabase's current
[scheduled-functions guide](https://supabase.com/docs/guides/functions/schedule-functions)
recommends `pg_cron`, `pg_net`, and Vault for scheduled Edge Function calls.

### Provider app configuration

Register one OAuth web client for each provider. Set the exact redirect URI to:

```text
https://<project-ref>.supabase.co/functions/v1/calendar-oauth-callback
```

For a local Supabase stack, use the local HTTPS/HTTP callback URL shown by the
local function endpoint and use only a local OAuth client. Do not use a
Production client secret in Dev.

- **Google:** configure the OAuth consent screen and web client; add the callback
  above as an authorized redirect URI. The app uses `calendar.events.owned.readonly`
  and requests offline access. Google may require consent-screen testing,
  verification, or publication steps for the configured project.
- **Microsoft:** register a Web redirect URI for the callback above, enable the
  account types intended for the product, and grant delegated `Calendars.ReadBasic`.
  The request includes `offline_access` so the server can refresh tokens.

Set these server-side Edge Function secrets in each environment:

- `APP_URL` — the deployed app root (for example `https://example.test` or its
  `index.html` URL).
- `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`.
- `MICROSOFT_CALENDAR_CLIENT_ID` and `MICROSOFT_CALENDAR_CLIENT_SECRET`.
- `CANVAS_TOKEN_ENCRYPTION_KEY` — the existing 32-byte, base64-encoded secret
  used by Canvas/Brightspace; calendar OAuth tokens and PKCE verifiers use this
  same AES-GCM key.

The browser receives only a short-lived authorization URL. Provider access and
refresh tokens and OAuth PKCE verifiers are encrypted in server-only tables.
Never store these credentials in browser storage or source control.

Disconnect sends the saved Google refresh token to Google's revocation endpoint.
DueVinci reports provider revocation only when the endpoint returns HTTP 200; any
other response means revocation was not confirmed. Local tokens are deleted and
imported events are hidden either way. If Google revocation is not confirmed, the
user can remove DueVinci from their Google Account connections. For Outlook,
DueVinci deletes its local tokens; the user can remove the app's consent in
Microsoft My Apps to revoke provider consent. Imported event rows are deactivated,
not deleted.

## Scheduled Canvas coursework and grade alerts

The scheduler checks every minute and processes at most one due account per
invocation, for a nominal capacity of 60 account refreshes per hour. A
conditional claim limits scheduled checks to about one per account every 55
minutes. A successful manual Canvas sync resets the next scheduled interval, but
manual sync itself is not pre-throttled. A backlog larger than the hourly
capacity can extend the scheduled refresh interval. The worker refreshes dated
assignments from the student's saved Canvas course selections. Each automatic
refresh supports up to 100 selected courses, 1,000 assignments per course, and
10,000 assignments total. Grade alerts require the separate opt-in toggle and
browser push permission on a subscribed device. The first
grade observation establishes a baseline; an alert is sent when Canvas reports
a posted grade for the current submission and its posted date, score, or grade
changes. Canvas comments and submission text are not stored.

`canvas_grade_snapshots` is service-role-only and stores assignment/course IDs,
title, grade, score, points possible, posted time, and observation time. Push
delivery is idempotent per device and grade change. If a retryable push delivery
fails, the grade snapshot is not advanced, so the next Canvas refresh can retry
the notification.

The migration schedules `duevinci-canvas-scheduled-sync` using `pg_cron` and
`pg_net`. Add the following through the project's approved secret-management
workflows; the two cron secret values must match:

- Edge Function secret `CANVAS_SCHEDULER_SECRET`.
- Supabase Vault entry `duevinci_project_url`, containing the project URL.
- Supabase Vault entry `duevinci_canvas_scheduler_secret`, containing the same
  secret as `CANVAS_SCHEDULER_SECRET`.

For Canvas push alerts, also configure the Edge Function secrets
`VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`. These are required
for delivery even when the browser has an active push subscription.

The job is intentionally inactive as an integration until the Vault values are
present. The function rejects calls without the matching private header and
disables the option for accounts that no longer have the Pro entitlement.
Review `cron.job` and `cron.job_run_details` plus the `canvas-scheduled-sync`
Edge Function logs when diagnosing a missed run. Do not include account tokens
or provider response bodies in incident notes.

## Apply and deploy

Apply migrations to the intended environment before deploying the matching
functions. Use the existing Supabase Dev/Production release procedure and
project references; never apply this migration to Production as part of local
verification.

Deploy these functions after the schema and secrets are ready:

```sh
supabase functions deploy calendar-integrations --project-ref <project-ref>
supabase functions deploy calendar-oauth-callback --no-verify-jwt --project-ref <project-ref>
supabase functions deploy canvas-sync --project-ref <project-ref>
supabase functions deploy canvas-auto-sync-settings --project-ref <project-ref>
supabase functions deploy canvas-scheduled-sync --no-verify-jwt --project-ref <project-ref>
```

The callback validates one-time state and PKCE before saving tokens. The
scheduled function uses a private Vault-backed header because it has no user JWT.
`supabase/config.toml` disables gateway JWT verification only for those two
endpoints; the callback still requires the one-time OAuth state, and the worker
requires its private scheduler secret.

Local tests cover provider payload parsing, idempotent row writes, stale-event
isolation, Canvas grade baselining, and retry ordering. They do not verify real
provider consent, provider secrets, the hosted cron job, or push delivery.
