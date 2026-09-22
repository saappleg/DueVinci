create table if not exists public.flashcard_mastery (
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id text not null,
    mastery jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (user_id, course_id),
    constraint flashcard_mastery_is_object check (jsonb_typeof(mastery) = 'object')
);

alter table public.flashcard_mastery enable row level security;
revoke all on table public.flashcard_mastery from anon;
grant select, insert, update, delete on table public.flashcard_mastery to authenticated;

drop policy if exists "Users read their flashcard mastery" on public.flashcard_mastery;
create policy "Users read their flashcard mastery"
    on public.flashcard_mastery for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users create their flashcard mastery" on public.flashcard_mastery;
create policy "Users create their flashcard mastery"
    on public.flashcard_mastery for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their flashcard mastery" on public.flashcard_mastery;
create policy "Users update their flashcard mastery"
    on public.flashcard_mastery for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their flashcard mastery" on public.flashcard_mastery;
create policy "Users delete their flashcard mastery"
    on public.flashcard_mastery for delete to authenticated
    using ((select auth.uid()) = user_id);

-- Route writes through this atomic merge so updates from two devices cannot
-- replace each other's card progress with a stale whole-deck JSON snapshot.
revoke insert, update on table public.flashcard_mastery from authenticated;

create or replace function public.merge_flashcard_mastery(
    p_user_id uuid,
    p_course_id text,
    p_mastery jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_mastery jsonb;
    v_entry record;
    v_current jsonb;
    v_current_reviewed timestamptz;
    v_incoming_reviewed timestamptz;
begin
    if (select auth.uid()) is distinct from p_user_id then
        raise exception 'Cannot write flashcard mastery for another user';
    end if;
    if p_course_id is null or length(p_course_id) = 0 or jsonb_typeof(p_mastery) is distinct from 'object' then
        raise exception 'Invalid flashcard mastery';
    end if;

    insert into public.flashcard_mastery (user_id, course_id, mastery)
    values (p_user_id, p_course_id, '{}'::jsonb)
    on conflict (user_id, course_id) do nothing;

    select mastery into v_mastery
      from public.flashcard_mastery
     where user_id = p_user_id and course_id = p_course_id
     for update;

    for v_entry in select key, value from jsonb_each(p_mastery)
    loop
        if jsonb_typeof(v_entry.value) is distinct from 'object' then
            raise exception 'Invalid flashcard card state';
        end if;
        v_current := v_mastery -> v_entry.key;
        v_current_reviewed := coalesce(
            nullif(v_current ->> 'lastReviewedAt', '')::timestamptz,
            nullif(v_current ->> 'lastReviewed', '')::date::timestamptz,
            '-infinity'::timestamptz
        );
        v_incoming_reviewed := coalesce(
            nullif(v_entry.value ->> 'lastReviewedAt', '')::timestamptz,
            nullif(v_entry.value ->> 'lastReviewed', '')::date::timestamptz,
            '-infinity'::timestamptz
        );
        if v_current is null or v_incoming_reviewed >= v_current_reviewed then
            v_mastery := jsonb_set(v_mastery, array[v_entry.key], v_entry.value, true);
        end if;
    end loop;

    update public.flashcard_mastery
       set mastery = v_mastery, updated_at = now()
     where user_id = p_user_id and course_id = p_course_id;
    return v_mastery;
end;
$$;

revoke all on function public.merge_flashcard_mastery(uuid, text, jsonb) from public, anon;
grant execute on function public.merge_flashcard_mastery(uuid, text, jsonb) to authenticated;

create or replace function public.delete_flashcard_mastery_for_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.flashcard_mastery
     where user_id = old.user_id and course_id = old.id::text;
    return old;
end;
$$;

revoke all on function public.delete_flashcard_mastery_for_course() from public, anon, authenticated;

drop trigger if exists delete_course_flashcard_mastery on public.courses;
create trigger delete_course_flashcard_mastery
    after delete on public.courses
    for each row execute function public.delete_flashcard_mastery_for_course();

create table if not exists public.tutor_usage_monthly (
    user_id uuid not null references auth.users(id) on delete cascade,
    month_start date not null,
    usage_date date not null,
    requests_used integer not null default 0 check (requests_used >= 0),
    requests_today integer not null default 0 check (requests_today >= 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, month_start)
);

alter table public.tutor_usage_monthly enable row level security;
revoke all on table public.tutor_usage_monthly from anon;
grant select on table public.tutor_usage_monthly to authenticated;
grant all on table public.tutor_usage_monthly to service_role;

drop policy if exists "Users read their Tutor usage" on public.tutor_usage_monthly;
create policy "Users read their Tutor usage"
    on public.tutor_usage_monthly for select to authenticated
    using ((select auth.uid()) = user_id);

create or replace function public.purge_expired_tutor_usage()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_deleted bigint;
begin
    delete from public.tutor_usage_monthly
     where updated_at < now() - interval '12 months';
    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

revoke all on function public.purge_expired_tutor_usage() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'duevinci-tutor-usage-retention';

select cron.schedule(
    'duevinci-tutor-usage-retention',
    '27 3 * * *',
    $job$select public.purge_expired_tutor_usage();$job$
);

create or replace function public.reserve_tutor_usage(
    p_user_id uuid,
    p_month_start date,
    p_usage_date date,
    p_month_limit integer,
    p_day_limit integer
)
returns table (requests_used integer, requests_today integer, allowed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_requests_used integer;
    v_requests_today integer;
    v_usage_date date;
begin
    if p_user_id is null or p_month_limit < 1 or p_day_limit < 1 then
        raise exception 'Invalid Tutor usage reservation';
    end if;

    insert into public.tutor_usage_monthly as usage (
        user_id, month_start, usage_date, requests_used, requests_today, updated_at
    ) values (
        p_user_id, p_month_start, p_usage_date, 1, 1, now()
    )
    on conflict (user_id, month_start) do update
       set requests_used = usage.requests_used + 1,
           requests_today = case
               when usage.usage_date = excluded.usage_date then usage.requests_today + 1
               else 1
           end,
           usage_date = excluded.usage_date,
           updated_at = now()
     where usage.requests_used < p_month_limit
       and (usage.usage_date <> p_usage_date or usage.requests_today < p_day_limit)
    returning usage.requests_used, usage.requests_today
         into v_requests_used, v_requests_today;

    if found then
        return query select v_requests_used, v_requests_today, true;
        return;
    end if;

    select usage.requests_used, usage.requests_today, usage.usage_date
      into v_requests_used, v_requests_today, v_usage_date
      from public.tutor_usage_monthly as usage
     where usage.user_id = p_user_id and usage.month_start = p_month_start;

    return query select coalesce(v_requests_used, 0),
                        case when v_usage_date is distinct from p_usage_date then 0
                             else coalesce(v_requests_today, 0) end,
                        false;
end;
$$;

revoke all on function public.reserve_tutor_usage(uuid, date, date, integer, integer) from public;
revoke all on function public.reserve_tutor_usage(uuid, date, date, integer, integer) from anon, authenticated;
grant execute on function public.reserve_tutor_usage(uuid, date, date, integer, integer) to service_role;

create or replace function public.release_tutor_usage(
    p_user_id uuid,
    p_month_start date,
    p_usage_date date
)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.tutor_usage_monthly
       set requests_used = greatest(requests_used - 1, 0),
           requests_today = case when usage_date = p_usage_date
               then greatest(requests_today - 1, 0)
               else requests_today end,
           updated_at = now()
     where user_id = p_user_id and month_start = p_month_start;
$$;

revoke all on function public.release_tutor_usage(uuid, date, date) from public, anon, authenticated;
grant execute on function public.release_tutor_usage(uuid, date, date) to service_role;

insert into public.subscription_plan_features (plan_key, feature_key)
values ('canvas_sync', 'daily_brief')
on conflict do nothing;

-- The existing owner UPDATE policy is still needed for reminder preferences,
-- but users must not be able to edit their own Stripe or entitlement columns.
revoke update on table public.profiles from public, anon, authenticated;
grant update (reminders_enabled, reminder_offsets) on table public.profiles to authenticated;
