-- Keep Canvas assignment imports idempotent and expose the last completed sync.
alter table public.assignments add column if not exists lms_source_id text;
alter table public.assignments add column if not exists lms_provider text;
alter table public.assignments add column if not exists lms_updated_at timestamptz;
alter table public.profiles add column if not exists canvas_last_synced_at timestamptz;

do $$
begin
    if to_regclass('public.assignments') is not null
       and not exists (
           select 1 from pg_constraint
           where conname = 'assignments_user_id_lms_source_id_key'
             and conrelid = 'public.assignments'::regclass
       ) then
        alter table public.assignments
            add constraint assignments_user_id_lms_source_id_key unique (user_id, lms_source_id);
    end if;
end $$;

alter table public.canvas_connections add column if not exists last_synced_at timestamptz;
