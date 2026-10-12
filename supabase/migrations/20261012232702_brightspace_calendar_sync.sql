-- Brightspace Calendar Feeds are private bearer links. Keep the encrypted link
-- in a server-only table and let Edge Functions manage imported calendar rows.
create table if not exists public.brightspace_connections (
    user_id uuid primary key references auth.users(id) on delete cascade,
    feed_url_encrypted text not null,
    last_synced_at timestamptz,
    last_sync_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint brightspace_connections_sync_count_check check (last_sync_count >= 0)
);

alter table public.brightspace_connections enable row level security;
revoke all on table public.brightspace_connections from public, anon, authenticated;
grant all on table public.brightspace_connections to service_role;

alter table public.custom_events add column if not exists source_provider text;
alter table public.custom_events add column if not exists source_event_id text;
alter table public.custom_events add column if not exists source_last_seen_at timestamptz;
alter table public.custom_events add column if not exists is_active boolean not null default true;
grant select, insert, update on table public.custom_events to service_role;

comment on table public.brightspace_connections is
    'Server-only Brightspace Calendar Feed connections. Feed URLs are AES-GCM encrypted before storage.';
comment on column public.custom_events.source_provider is
    'External calendar source for imported events, such as Brightspace.';
comment on column public.custom_events.source_event_id is
    'Stable source event or task key used for idempotent calendar feed sync.';
comment on column public.custom_events.is_active is
    'Imported calendar entries missing from the latest successful source sync are hidden, not deleted.';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'custom_events_user_source_event_key'
          and conrelid = 'public.custom_events'::regclass
    ) then
        alter table public.custom_events
            add constraint custom_events_user_source_event_key
            unique (user_id, source_provider, source_event_id);
    end if;
end $$;

insert into public.subscription_plan_features (plan_key, feature_key)
values ('canvas_sync', 'brightspace_sync')
on conflict do nothing;
