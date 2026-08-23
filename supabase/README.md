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
supabase functions deploy stripe-webhook --project-ref kinsxkeerxguqkyzrjfm
```

`start-trial` requires `SUPABASE_SERVICE_ROLE_KEY`. Stripe billing functions require
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`,
`STRIPE_YEARLY_PRICE_ID`, and `APP_URL`. Keep each environment's Test or Live Stripe
credentials and price IDs separate.

Canvas Sync currently calls Canvas directly from the browser, so the target Canvas instance must permit requests from the Dev origin. The `20260823112000_canvas_subscription_foundation.sql` migration creates the profile fields, RLS policies, signup trigger, and LMS course identity required by the active vanilla-JS UI. The `20260823114000_canvas_billing.sql` migration adds Stripe customer/subscription identities and the one-time trial marker.
