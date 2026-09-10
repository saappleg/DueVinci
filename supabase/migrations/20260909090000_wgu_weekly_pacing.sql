-- Preserve source course windows and weekly pacing metadata for browser/LMS imports.
-- WGU provides a course window on the term page and workload in a week-based guide.
alter table if exists public.courses add column if not exists start_date date;
alter table if exists public.courses add column if not exists end_date date;
alter table if exists public.courses add column if not exists pacing_type text;
alter table if exists public.courses add column if not exists pacing_source text;

comment on column public.courses.start_date is 'The source course start date, when provided by an LMS or importer.';
comment on column public.courses.end_date is 'The source course end date, when provided by an LMS or importer.';
comment on column public.courses.pacing_type is 'Optional pacing model such as weekly.';
comment on column public.courses.pacing_source is 'Source used to establish the pacing model and course window.';

create index if not exists courses_user_id_start_date_idx
    on public.courses (user_id, start_date);

