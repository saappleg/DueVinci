-- Push subscriptions and cloud-backed reminder preferences.
alter table public.profiles add column if not exists reminders_enabled boolean not null default true;
alter table public.profiles add column if not exists reminder_offsets integer[] not null default array[0, 1, 3];

create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "Users manage their own push subscriptions" on public.push_subscriptions
    for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.push_delivery_log (
    subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
    reminder_key text not null,
    sent_at timestamptz not null default now(),
    primary key (subscription_id, reminder_key)
);
alter table public.push_delivery_log enable row level security;

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
