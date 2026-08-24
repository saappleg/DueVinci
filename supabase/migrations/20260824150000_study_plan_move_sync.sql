-- Per-user manual study-plan placements. A NULL planned_for value is a
-- tombstone, allowing a reset made on one device to sync to every other one.
create table if not exists public.study_plan_moves (
    user_id uuid not null references auth.users(id) on delete cascade,
    task_id text not null,
    planned_for date,
    updated_at timestamptz not null default now(),
    primary key (user_id, task_id)
);

alter table public.study_plan_moves enable row level security;

drop policy if exists "Users can view their own study plan moves" on public.study_plan_moves;
create policy "Users can view their own study plan moves"
    on public.study_plan_moves for select
    using (auth.uid() = user_id);

drop policy if exists "Users can create their own study plan moves" on public.study_plan_moves;
create policy "Users can create their own study plan moves"
    on public.study_plan_moves for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own study plan moves" on public.study_plan_moves;
create policy "Users can update their own study plan moves"
    on public.study_plan_moves for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
