-- Server-only OAuth credentials and opt-in scheduled Canvas refresh.
create extension if not exists pg_net with schema extensions;

alter table public.canvas_connections
    add column if not exists auto_sync_enabled boolean not null default false,
    add column if not exists grade_alerts_enabled boolean not null default false,
    add column if not exists last_auto_sync_claimed_at timestamptz,
    add column if not exists last_auto_sync_error text;

create table if not exists public.canvas_grade_snapshots (
    user_id uuid not null references auth.users(id) on delete cascade,
    canvas_assignment_id text not null,
    canvas_course_id text not null,
    assignment_title text not null,
    grade text,
    score numeric,
    points_possible numeric,
    posted_at timestamptz,
    observed_at timestamptz not null default now(),
    primary key (user_id, canvas_assignment_id)
);

alter table public.canvas_grade_snapshots enable row level security;
revoke all on table public.canvas_grade_snapshots from public, anon, authenticated;
grant all on table public.canvas_grade_snapshots to service_role;

comment on table public.canvas_grade_snapshots is
    'Server-only minimal Canvas grade state used to detect newly posted or changed grades. Submission content and comments are never stored.';

create table if not exists public.calendar_connections (
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('google', 'outlook')),
    access_token_encrypted text not null,
    refresh_token_encrypted text not null,
    expires_at timestamptz not null,
    connected_at timestamptz not null default now(),
    last_synced_at timestamptz,
    last_sync_count integer not null default 0 check (last_sync_count >= 0),
    last_sync_error text,
    needs_reconnect boolean not null default false,
    sync_claimed_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (user_id, provider)
);

alter table public.calendar_connections
    add column if not exists sync_claimed_at timestamptz;

alter table public.calendar_connections enable row level security;
revoke all on table public.calendar_connections from public, anon, authenticated;
grant all on table public.calendar_connections to service_role;

create table if not exists public.calendar_oauth_states (
    state_hash text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('google', 'outlook')),
    code_verifier_encrypted text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

alter table public.calendar_oauth_states enable row level security;
revoke all on table public.calendar_oauth_states from public, anon, authenticated;
grant all on table public.calendar_oauth_states to service_role;

comment on table public.calendar_connections is
    'Server-only read-only Google and Microsoft calendar OAuth connections. Provider access and refresh tokens are AES-GCM encrypted.';
comment on table public.calendar_oauth_states is
    'Short-lived, single-use OAuth state and encrypted PKCE verifier; only service-role Edge Functions can access it.';

alter table public.custom_events add column if not exists source_provider text;
alter table public.custom_events add column if not exists source_event_id text;
alter table public.custom_events add column if not exists source_last_seen_at timestamptz;
alter table public.custom_events add column if not exists is_active boolean not null default true;
grant select, insert, update on table public.custom_events to service_role;

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
values
    ('canvas_sync', 'canvas_auto_sync'),
    ('canvas_sync', 'calendar_sync')
on conflict do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname = 'duevinci-canvas-scheduled-sync';

-- The job stays dormant until operators add `duevinci_project_url` and
-- `duevinci_canvas_scheduler_secret` to Supabase Vault. The Edge Function also
-- checks that secret before it can process any account. It checks every minute
-- and claims one due account; each user's own refresh interval is about 55 min.
select cron.schedule(
    'duevinci-canvas-scheduled-sync',
    '* * * * *',
    $job$
      select case
        when secrets.project_url is not null and secrets.cron_secret is not null then
          net.http_post(
            url := secrets.project_url || '/functions/v1/canvas-scheduled-sync',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-duevinci-cron-secret', secrets.cron_secret
            ),
            body := jsonb_build_object('triggered_at', now())
          )
        else null
      end
      from (
        select
          (select decrypted_secret from vault.decrypted_secrets where name = 'duevinci_project_url') as project_url,
          (select decrypted_secret from vault.decrypted_secrets where name = 'duevinci_canvas_scheduler_secret') as cron_secret
      ) as secrets;
    $job$
);
