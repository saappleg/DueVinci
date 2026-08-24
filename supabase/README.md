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
supabase functions deploy create-portal-session canvas-connect canvas-courses canvas-sync canvas-disconnect --project-ref kinsxkeerxguqkyzrjfm
# Stripe does not send a Supabase JWT; stripe-webhook verifies Stripe's signed
# payload itself, so it must be deployed without the gateway JWT requirement.
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy submit-support-ticket --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy manage-support-tickets --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy report-client-error --project-ref kinsxkeerxguqkyzrjfm
```

`start-trial` requires `SUPABASE_SERVICE_ROLE_KEY`. Stripe billing functions require
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`,
`STRIPE_YEARLY_PRICE_ID`, and `APP_URL`. Keep each environment's Test or Live Stripe
credentials and price IDs separate.

Subscription access is feature-based: `subscription_plan_features` maps a plan
key to its enabled features. Add future paid features by creating a plan key and
feature mapping, then use the shared Edge Function entitlement check.

Canvas tokens are stored in the server-only `canvas_connections` table and Canvas API calls run through Edge Functions. The `20260823123000_secure_canvas_connections.sql` migration moves any old profile token into that table and clears the browser-readable value.

`CANVAS_TOKEN_ENCRYPTION_KEY` is a separate 32-byte, base64-encoded Edge Function secret used to encrypt Canvas tokens with AES-GCM before storage. Dev and Production must use different keys; never place either key in browser code or source control.

Canvas sync imports selected courses and Canvas assignments that have due dates. LMS source IDs make repeat syncs update the same courses and assignments instead of creating duplicates.

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
`resolved_at` timestamp. The job must be present in both Dev and Production.
