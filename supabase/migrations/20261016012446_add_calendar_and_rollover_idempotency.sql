-- Keep calendar conversions and term rollovers idempotent across tabs/devices.
alter table public.assignments
    add column if not exists source_calendar_event_id text;

alter table public.courses
    add column if not exists rollover_source_course_id text;

create unique index if not exists assignments_user_calendar_event_unique
    on public.assignments (user_id, source_calendar_event_id);

create unique index if not exists courses_user_term_rollover_source_unique
    on public.courses (user_id, term, rollover_source_course_id);

comment on column public.assignments.source_calendar_event_id is
    'Source custom calendar event for an assignment conversion; unique per user to make concurrent conversions idempotent.';

comment on column public.courses.rollover_source_course_id is
    'Source course ID for a term rollover copy; combined with user and term to make retries idempotent.';
