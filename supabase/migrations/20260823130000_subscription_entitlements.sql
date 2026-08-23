-- Generic plan-to-feature mapping. Add future subscription features by adding
-- rows here; Edge Functions query this mapping instead of hard-coding plans.
alter table public.profiles add column if not exists subscription_plan text not null default 'canvas_sync';

create table if not exists public.subscription_plan_features (
    plan_key text not null,
    feature_key text not null,
    created_at timestamptz not null default now(),
    primary key (plan_key, feature_key)
);

alter table public.subscription_plan_features enable row level security;

insert into public.subscription_plan_features (plan_key, feature_key)
values ('canvas_sync', 'canvas_sync')
on conflict do nothing;

-- Only service-role Edge Functions can change plan mappings.
