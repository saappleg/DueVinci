-- Free coursework controls persist task type and priority in Supabase.
alter table public.assignments add column if not exists task_type text;
alter table public.assignments add column if not exists type text;
alter table public.assignments add column if not exists priority text;
