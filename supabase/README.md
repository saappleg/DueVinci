# DueVinci Dev Supabase

This directory contains the database migrations and Edge Functions used by the Dev environment.

## Apply the Dev schema

```sh
supabase db push --project-ref kinsxkeerxguqkyzrjfm
```

## Deploy Edge Functions

```sh
supabase functions deploy start-trial --project-ref kinsxkeerxguqkyzrjfm
supabase functions deploy stripe-webhook --project-ref kinsxkeerxguqkyzrjfm
```

`start-trial` requires `SUPABASE_SERVICE_ROLE_KEY`. The Stripe webhook also requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

Canvas Sync currently calls Canvas directly from the browser, so the target Canvas instance must permit requests from the Dev origin. The `20260823112000_canvas_subscription_foundation.sql` migration creates the profile fields, RLS policies, signup trigger, and LMS course identity required by the active vanilla-JS UI.
