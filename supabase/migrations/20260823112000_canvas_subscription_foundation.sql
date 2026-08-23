-- Historical migration already applied to the Production project.
-- Kept in main so CLI migration history matches the remote database.
create table if not exists public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    subscription_status text not null default 'inactive',
    trial_end timestamptz,
    stripe_customer_id text,
    canvas_domain text,
    canvas_token text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists subscription_status text not null default 'inactive';
alter table public.profiles add column if not exists trial_end timestamptz;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists canvas_domain text;
alter table public.profiles add column if not exists canvas_token text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table if exists public.courses add column if not exists name text;
alter table if exists public.courses add column if not exists lms_source_id text;
alter table if exists public.courses add column if not exists lms_provider text;
alter table if exists public.courses add column if not exists updated_at timestamptz;

do $$
begin
    if to_regclass('public.courses') is not null
       and not exists (
           select 1 from pg_constraint
           where conname = 'courses_user_id_lms_source_id_key'
             and conrelid = 'public.courses'::regclass
       ) then
        alter table public.courses
            add constraint courses_user_id_lms_source_id_key unique (user_id, lms_source_id);
    end if;
end $$;

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
    on public.profiles for select
    using (auth.uid() = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
    on public.profiles for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
