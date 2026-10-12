-- Store optional task effort estimates; NULL keeps the planner's type-based default.
alter table public.assignments
    add column if not exists estimated_minutes integer;

alter table public.assignments
    drop constraint if exists assignments_estimated_minutes_check;
alter table public.assignments
    add constraint assignments_estimated_minutes_check
    check (estimated_minutes is null or estimated_minutes between 5 and 480);

-- A Stripe event is acknowledged only after its canonical subscription state
-- has been applied. Leases allow concurrent/retried deliveries to recover.
create table if not exists public.billing_stripe_events (
    event_id text primary key,
    event_type text not null,
    lock_token uuid,
    lock_expires_at timestamptz,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint billing_stripe_events_event_id_length check (char_length(event_id) between 1 and 255),
    constraint billing_stripe_events_event_type_length check (char_length(event_type) between 1 and 120)
);

comment on table public.billing_stripe_events is
    'Processed Stripe event IDs used to make subscription webhook delivery idempotent.';

alter table public.billing_stripe_events enable row level security;
revoke all on table public.billing_stripe_events from public, anon, authenticated;
grant all on table public.billing_stripe_events to service_role;

create or replace function public.acquire_stripe_event_lock(
    p_event_id text,
    p_event_type text,
    p_lock_token uuid,
    p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_acquired boolean;
begin
    if p_event_id is null or char_length(p_event_id) not between 1 and 255
       or p_event_type is null or char_length(p_event_type) not between 1 and 120
       or p_lock_token is null or p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 600 then
        raise exception 'Invalid Stripe event lock request';
    end if;

    insert into public.billing_stripe_events (event_id, event_type, lock_token, lock_expires_at)
    values (p_event_id, p_event_type, p_lock_token, now() + make_interval(secs => p_lease_seconds))
    on conflict (event_id) do update
       set event_type = excluded.event_type,
           lock_token = excluded.lock_token,
           lock_expires_at = excluded.lock_expires_at,
           updated_at = now()
     where public.billing_stripe_events.processed_at is null
       and (public.billing_stripe_events.lock_expires_at is null
         or public.billing_stripe_events.lock_expires_at <= now())
    returning true into v_acquired;

    return coalesce(v_acquired, false);
end;
$$;

create or replace function public.mark_stripe_event_processed(p_event_id text, p_lock_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_event_id is null or p_lock_token is null then
        raise exception 'Invalid Stripe event completion request';
    end if;

    update public.billing_stripe_events
       set processed_at = now(), lock_token = null, lock_expires_at = null, updated_at = now()
     where event_id = p_event_id and lock_token = p_lock_token and processed_at is null;

    return found;
end;
$$;

create or replace function public.release_stripe_event_lock(p_event_id text, p_lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_event_id is null or p_lock_token is null then
        raise exception 'Invalid Stripe event release request';
    end if;

    update public.billing_stripe_events
       set lock_token = null, lock_expires_at = null, updated_at = now()
     where event_id = p_event_id and lock_token = p_lock_token and processed_at is null;
end;
$$;

revoke all on function public.acquire_stripe_event_lock(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_stripe_event_processed(text, uuid) from public, anon, authenticated;
revoke all on function public.release_stripe_event_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_stripe_event_lock(text, text, uuid, integer) to service_role;
grant execute on function public.mark_stripe_event_processed(text, uuid) to service_role;
grant execute on function public.release_stripe_event_lock(text, uuid) to service_role;
