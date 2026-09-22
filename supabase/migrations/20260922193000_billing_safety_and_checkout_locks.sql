-- Restore owner-scoped reminder updates. Column privileges below this policy
-- still prevent users from changing billing or subscription fields.
drop policy if exists "Users can update reminder preferences" on public.profiles;
create policy "Users can update reminder preferences"
    on public.profiles for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
grant update (display_name) on table public.profiles to authenticated;

create table if not exists public.billing_checkout_sessions (
    user_id uuid primary key references auth.users(id) on delete cascade,
    plan_interval text check (plan_interval in ('monthly', 'yearly')),
    attempt_interval text check (attempt_interval in ('monthly', 'yearly')),
    attempt_key text,
    session_id text unique,
    session_url text,
    session_expires_at timestamptz,
    lock_token uuid,
    lock_expires_at timestamptz,
    updated_at timestamptz not null default now()
);

alter table public.billing_checkout_sessions enable row level security;
revoke all on table public.billing_checkout_sessions from public, anon, authenticated;
grant all on table public.billing_checkout_sessions to service_role;

create or replace function public.acquire_checkout_session_lock(
    p_user_id uuid,
    p_lock_token uuid,
    p_lease_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_acquired boolean;
begin
    if p_user_id is null or p_lock_token is null or p_lease_seconds < 1 or p_lease_seconds > 600 then
        raise exception 'Invalid checkout lock request';
    end if;

    insert into public.billing_checkout_sessions (user_id, lock_token, lock_expires_at)
    values (p_user_id, p_lock_token, now() + make_interval(secs => p_lease_seconds))
    on conflict (user_id) do update
       set lock_token = excluded.lock_token,
           lock_expires_at = excluded.lock_expires_at,
           updated_at = now()
     where public.billing_checkout_sessions.lock_expires_at is null
        or public.billing_checkout_sessions.lock_expires_at <= now()
    returning true into v_acquired;

    return coalesce(v_acquired, false);
end;
$$;

create or replace function public.save_checkout_session(
    p_user_id uuid,
    p_lock_token uuid,
    p_interval text,
    p_session_id text,
    p_session_url text,
    p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_interval not in ('monthly', 'yearly') or p_session_id is null or p_session_url is null or p_expires_at is null then
        raise exception 'Invalid checkout session';
    end if;

    update public.billing_checkout_sessions
       set plan_interval = p_interval,
           session_id = p_session_id,
           session_url = p_session_url,
           session_expires_at = p_expires_at,
           attempt_interval = null,
           attempt_key = null,
           updated_at = now()
     where user_id = p_user_id and lock_token = p_lock_token;

    return found;
end;
$$;

create or replace function public.save_checkout_attempt(
    p_user_id uuid,
    p_lock_token uuid,
    p_interval text,
    p_attempt_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_interval not in ('monthly', 'yearly') or p_attempt_key is null then
        raise exception 'Invalid checkout attempt';
    end if;

    update public.billing_checkout_sessions
       set attempt_interval = p_interval,
           attempt_key = p_attempt_key,
           updated_at = now()
     where user_id = p_user_id and lock_token = p_lock_token;

    return found;
end;
$$;

create or replace function public.release_checkout_session_lock(p_user_id uuid, p_lock_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.billing_checkout_sessions
       set lock_token = null, lock_expires_at = null, updated_at = now()
     where user_id = p_user_id and lock_token = p_lock_token;
$$;

revoke all on function public.acquire_checkout_session_lock(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.save_checkout_session(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.save_checkout_attempt(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_checkout_session_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_checkout_session_lock(uuid, uuid, integer) to service_role;
grant execute on function public.save_checkout_session(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.save_checkout_attempt(uuid, uuid, text, text) to service_role;
grant execute on function public.release_checkout_session_lock(uuid, uuid) to service_role;
