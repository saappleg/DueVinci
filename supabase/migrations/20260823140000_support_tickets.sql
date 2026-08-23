-- Durable support tickets are written only by the authenticated Edge Function.
-- Browser clients cannot read another student's support message.
create table if not exists public.support_tickets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    email text not null,
    category text not null,
    subject text not null,
    message text not null,
    status text not null default 'sending',
    created_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;

drop policy if exists "Users can view their own support tickets" on public.support_tickets;
create policy "Users can view their own support tickets"
    on public.support_tickets for select
    using (auth.uid() = user_id);
