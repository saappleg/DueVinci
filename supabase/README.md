# DueVinci Dev Supabase

This directory contains the database migrations and Edge Functions used by the Dev environment.

## Apply the Dev schema

```sh
supabase db push --project-ref kinsxkeerxguqkyzrjfm
```

## Deploy Edge Functions

```sh
supabase functions deploy start-trial --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy create-checkout-session --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy create-portal-session --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy subscription-status --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy tutor --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy delete-account --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy canvas-connect --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy canvas-courses --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy canvas-sync --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy canvas-disconnect --project-ref kinsxkeerxguqkyzrjfm
# Stripe does not send a Supabase JWT; stripe-webhook verifies Stripe's signed
# payload itself, so it must be deployed without the gateway JWT requirement.
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy submit-support-ticket --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy manage-support-tickets --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy report-client-error --project-ref kinsxkeerxguqkyzrjfm
```

`start-trial` requires `SUPABASE_SERVICE_ROLE_KEY`; if an account already has Stripe
identifiers, it also requires `STRIPE_SECRET_KEY` to reconcile the existing
subscription. Stripe billing functions require `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_YEARLY_PRICE_ID`, and
`APP_URL`. Keep each environment's Test or Live Stripe credentials and price IDs
separate.

`delete-account` also requires `STRIPE_SECRET_KEY` for accounts with billing
records. It cancels outstanding subscriptions, removes server-held account data,
then deletes the Auth user. Cleanup steps are idempotent so a failed request can
be retried while the account still exists. The browser clears its account-scoped
IndexedDB and local flashcard cache after the endpoint confirms deletion.

The `20260922184331_add_flashcard_mastery_and_tutor_usage.sql` migration adds
account-scoped cloud flashcard mastery with atomic per-card merging, a private Tutor usage ledger, and the
`daily_brief` feature mapping for the existing Pro plan. Apply database migrations
before deploying the matching functions or frontend. Tutor usage defaults to
8 requests/day and 40/month during trial, and 30/day and 250/month on a paid plan;
`TUTOR_TRIAL_DAILY_REQUEST_LIMIT`, `TUTOR_TRIAL_MONTHLY_REQUEST_LIMIT`,
`TUTOR_DAILY_REQUEST_LIMIT`, and `TUTOR_MONTHLY_REQUEST_LIMIT` can override them.
Only the service role can reserve or release usage; users can read their own usage
row. Tutor prompts that fail before reaching the model do not use quota; upstream
failures trigger a quota release. The migration schedules a daily cleanup that
removes Tutor usage rows within 12 months of last activity; account deletion
removes all remaining rows through the user foreign key.
The public offer shows the default Tutor quotas. If the quota secrets are changed,
update `js/modules/subscription.js` before release so the offer and enforcement agree.

The `20260922193000_billing_safety_and_checkout_locks.sql` migration restores
owner-scoped reminder updates while keeping billing columns service-role-only.
It also adds a private per-account checkout lock and active-session record so
concurrent requests cannot open duplicate subscriptions.

Checkout and billing-portal return URLs must match `APP_URL` at the root or its
`index.html` path. Set `ALLOW_LOCALHOST_RETURN_URLS=true` only in a local development
environment when testing Stripe redirects.

Subscription access is feature-based: `subscription_plan_features` maps a plan
key to its enabled features. Add future paid features by creating a plan key and
feature mapping, then use the shared Edge Function entitlement check.

Canvas tokens are stored in the server-only `canvas_connections` table and Canvas API calls run through Edge Functions. The `20260823123000_secure_canvas_connections.sql` migration moves any old profile token into that table and clears the browser-readable value.

`CANVAS_TOKEN_ENCRYPTION_KEY` is a separate 32-byte, base64-encoded Edge Function secret used to encrypt Canvas tokens with AES-GCM before storage. Dev and Production must use different keys; never place either key in browser code or source control.

Canvas sync imports selected courses and Canvas assignments that have due dates. LMS source IDs make repeat syncs update the same courses and assignments instead of creating duplicates.

Browser imports can also preserve source course windows and weekly pacing. The
`20260909090000_wgu_weekly_pacing.sql` migration adds `start_date`, `end_date`,
`pacing_type`, and `pacing_source` to courses. WGU pacing-guide items use the
existing assignment `unit_number` field as their week number, so the course
view can group and label them as Week 1, Week 2, and so on.

The `20260910031901_extension_beta_poll.sql` migration adds the anonymous
importer preference poll. The follow-up
`20260910032254_extension_beta_poll_lockdown.sql` migration makes the table
explicitly write-only for `anon` and `authenticated`: visitors can submit a
choice, but individual responses cannot be read through the Data API. The
`20260910034000_extension_beta_poll_multi_select.sql` migration adds the
`preferences` array so a visitor can select multiple paths. The table stores
no account or device identifier.

## Dev Canvas mock

Set `ENABLE_CANVAS_MOCK=true` only in the Dev project to show the local-only sample
Canvas account. It exercises connection, course selection, and import with three
fixture courses. Do not set this variable in Production.

Before a future Production release, run `npm run verify:production-release` with
the intended Production environment variables loaded. It rejects Test Stripe
keys, localhost return URLs, and the Dev Canvas mock flag.

## Support email

`submit-support-ticket` records the authenticated user's ticket and sends it
through Resend. Set `RESEND_API_KEY`, `SUPPORT_TO_EMAIL`, and
`SUPPORT_FROM_EMAIL` as project secrets. `SUPPORT_FROM_EMAIL` must use a domain
verified in Resend; the function only confirms delivery after Resend accepts it.

## Privacy retention

Migration `20260823142000_privacy_retention.sql` schedules a daily Supabase Cron
job named `duevinci-privacy-retention`. It deletes `app_error_events` after 90
days and tickets marked `resolved` or `closed` 90 days after their
`resolved_at` timestamp. Tutor usage has a separate daily cleanup job and is
removed after 12 months. These jobs must be present in both Dev and Production.
