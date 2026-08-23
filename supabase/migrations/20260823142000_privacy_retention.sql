-- Privacy retention: error diagnostics are short-lived, and completed support
-- conversations are retained only long enough for follow-up and auditing.
create extension if not exists pg_cron with schema extensions;

alter table public.support_tickets
    add column if not exists resolved_at timestamptz;

-- Existing completed tickets predate resolved_at. Their creation date is the
-- only reliable completion timestamp available, so use it for the one-time
-- backfill.
update public.support_tickets
set resolved_at = created_at
where status in ('resolved', 'closed')
  and resolved_at is null;

create index if not exists support_tickets_resolved_at_retention_idx
    on public.support_tickets (resolved_at)
    where status in ('resolved', 'closed');

create index if not exists app_error_events_created_at_retention_idx
    on public.app_error_events (created_at);

create or replace function public.purge_expired_privacy_data()
returns table (deleted_error_events bigint, deleted_support_tickets bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.app_error_events
    where created_at < now() - interval '90 days';
    get diagnostics deleted_error_events = row_count;

    delete from public.support_tickets
    where status in ('resolved', 'closed')
      and resolved_at < now() - interval '90 days';
    get diagnostics deleted_support_tickets = row_count;

    return next;
end;
$$;

-- This maintenance function is only for the database scheduler/admin role.
revoke all on function public.purge_expired_privacy_data() from public, anon, authenticated;

-- Reapplying the migration remains safe and replaces the schedule if needed.
select cron.unschedule(jobid)
from cron.job
where jobname = 'duevinci-privacy-retention';

select cron.schedule(
    'duevinci-privacy-retention',
    '17 3 * * *', -- daily at 03:17 UTC
    $job$select public.purge_expired_privacy_data();$job$
);
