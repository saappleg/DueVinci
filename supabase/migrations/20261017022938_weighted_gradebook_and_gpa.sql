-- Weighted gradebook configuration stays on the existing user-owned course and
-- assignment rows, so current table grants and RLS policies continue to apply.
alter table public.courses
    add column if not exists credit_hours numeric(5,2) not null default 3.00,
    add column if not exists grade_categories jsonb not null
        default '[{"id":"coursework","name":"Coursework","weight":100}]'::jsonb;

alter table public.assignments
    add column if not exists grade_category_id text;

do $$
begin
    if not exists (
        select 1
          from pg_constraint
         where conname = 'courses_credit_hours_range_check'
           and conrelid = 'public.courses'::regclass
    ) then
        alter table public.courses
            add constraint courses_credit_hours_range_check
            check (credit_hours > 0 and credit_hours <= 100);
    end if;

    if not exists (
        select 1
          from pg_constraint
         where conname = 'courses_grade_categories_array_check'
           and conrelid = 'public.courses'::regclass
    ) then
        alter table public.courses
            add constraint courses_grade_categories_array_check
            check (
                case
                    when jsonb_typeof(grade_categories) = 'array'
                    then jsonb_array_length(grade_categories) between 1 and 12
                    else false
                end
            );
    end if;
end
$$;

comment on column public.courses.credit_hours is
    'Credit hours used to weight this course in the planner GPA estimate; default is 3.';
comment on column public.courses.grade_categories is
    'JSON array of this course’s weighted grade categories. Weights must total 100 in the app.';
comment on column public.assignments.grade_category_id is
    'Stable category id from the owning course grade_categories array; null uses the first category.';
