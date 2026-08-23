alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists stripe_subscription_id text;

create unique index if not exists profiles_stripe_customer_id_key
    on public.profiles (stripe_customer_id)
    where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_key
    on public.profiles (stripe_subscription_id)
    where stripe_subscription_id is not null;
