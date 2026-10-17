-- Make gradebook participation explicit without removing existing saved grades.
do $$
begin
    if not exists (
        select 1
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'assignments'
           and column_name = 'is_gradeable'
    ) then
        alter table public.assignments
            add column if not exists is_gradeable boolean not null default false;

        update public.assignments
           set is_gradeable = true
         where grade is not null
            or grade_category_id is not null;
    end if;
end
$$;

comment on column public.assignments.is_gradeable is
    'Whether this coursework item appears in the student gradebook. New items default to not gradeable.';
