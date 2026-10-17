alter table public.assignments
    add column if not exists parent_assignment_id uuid,
    add column if not exists progress_percent smallint not null default 0,
    add column if not exists instructions text;

update public.assignments
set progress_percent = case
        when is_completed is true or progress_percent = 100 then 100
        else progress_percent
    end,
    is_completed = case
        when progress_percent = 100 then true
        else is_completed
    end
where (is_completed is true and progress_percent <> 100)
   or (progress_percent = 100 and is_completed is distinct from true);

update public.assignments
set is_completed = false
where is_completed is null;

alter table public.assignments
    alter column is_completed set not null;

create unique index if not exists assignments_user_id_id_unique_idx
    on public.assignments (user_id, id);

alter table public.assignments
    drop constraint if exists assignments_parent_assignment_id_fkey;

alter table public.assignments
    add constraint assignments_parent_assignment_id_fkey
    foreign key (user_id, parent_assignment_id)
    references public.assignments (user_id, id)
    on delete set null (parent_assignment_id);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'assignments_progress_percent_check'
          and conrelid = 'public.assignments'::regclass
    ) then
        alter table public.assignments
            add constraint assignments_progress_percent_check
            check (progress_percent between 0 and 100);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'assignments_progress_completion_check'
          and conrelid = 'public.assignments'::regclass
    ) then
        alter table public.assignments
            add constraint assignments_progress_completion_check
            check ((is_completed is true) = (progress_percent = 100));
    end if;
end $$;

create index if not exists assignments_parent_assignment_id_idx
    on public.assignments (user_id, parent_assignment_id);

create or replace function public.normalize_assignment_progress()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    if new.is_completed is true then
        new.progress_percent := 100;
    elsif tg_op = 'UPDATE' then
        if old.is_completed is true
            and new.progress_percent is not distinct from old.progress_percent then
            new.progress_percent := 0;
        elsif new.progress_percent = 100 then
            new.is_completed := true;
        end if;
    elsif new.progress_percent = 100 then
        new.is_completed := true;
    end if;
    return new;
end;
$$;

drop trigger if exists normalize_assignment_progress on public.assignments;
create trigger normalize_assignment_progress
    before insert or update of is_completed, progress_percent
    on public.assignments
    for each row
    execute function public.normalize_assignment_progress();

comment on column public.assignments.parent_assignment_id is
    'Optional parent coursework item; deleting the parent leaves the child as a standalone item.';

comment on column public.assignments.progress_percent is
    'Student-entered completion percentage from 0 to 100; 100 percent and completed status stay in sync.';

comment on column public.assignments.instructions is
    'Optional student-entered instructions used to draft editable coursework checklist proposals.';
