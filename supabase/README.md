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
supabase functions deploy stripe-webhook --project-ref kinsxkeerxguqkyzrjfm
```

`start-trial` requires `SUPABASE_SERVICE_ROLE_KEY`. Stripe billing functions require
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`,
`STRIPE_YEARLY_PRICE_ID`, and `APP_URL`. Keep each environment's Test or Live Stripe
credentials and price IDs separate.

Subscription access is feature-based: `subscription_plan_features` maps a plan
key to its enabled features. Add future paid features by creating a plan key and
feature mapping, then use the shared Edge Function entitlement check.

Canvas tokens are stored in the server-only `canvas_connections` table and Canvas API calls run through Edge Functions. The `20260823123000_secure_canvas_connections.sql` migration moves any old profile token into that table and clears the browser-readable value.

Canvas sync imports selected courses and Canvas assignments that have due dates. LMS source IDs make repeat syncs update the same courses and assignments instead of creating duplicates.

## Dev Canvas mock

Set `ENABLE_CANVAS_MOCK=true` only in the Dev project to show the local-only sample
Canvas account. It exercises connection, course selection, and import with three
fixture courses. Do not set this variable in Production.
