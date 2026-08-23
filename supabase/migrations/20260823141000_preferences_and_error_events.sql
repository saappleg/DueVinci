create table if not exists public.user_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    preferences jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can view their own preferences" on public.user_preferences;
create policy "Users can view their own preferences"
    on public.user_preferences for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own preferences" on public.user_preferences;
create policy "Users can insert their own preferences"
    on public.user_preferences for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own preferences" on public.user_preferences;
create policy "Users can update their own preferences"
    on public.user_preferences for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create table if not exists public.app_error_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    source text not null,
    message text not null,
    stack text,
    path text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.app_error_events enable row level security;
