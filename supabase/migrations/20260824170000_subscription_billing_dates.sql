-- Keep Stripe's renewal and scheduled-cancellation dates available to the
-- subscription UI without exposing any payment data to the browser.
alter table public.profiles
    add column if not exists subscription_current_period_end timestamptz,
    add column if not exists subscription_cancel_at timestamptz,
    add column if not exists subscription_cancel_at_period_end boolean not null default false;
