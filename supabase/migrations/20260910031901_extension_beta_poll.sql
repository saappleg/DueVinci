-- Anonymous product-feedback poll for the coursework importer beta.
-- Deliberately stores no user_id, email, IP address, or browser identifier.
create table if not exists public.extension_beta_poll_votes (
    id uuid primary key default gen_random_uuid(),
    preference text not null check (preference in ('extension', 'api', 'gemini', 'unsure')),
    created_at timestamptz not null default timezone('utc', now())
);

comment on table public.extension_beta_poll_votes is
    'Anonymous preference votes for DueVinci coursework import options; no account or device identifier is stored.';

alter table public.extension_beta_poll_votes enable row level security;

-- This is a write-only public feedback endpoint. Results remain available to
-- trusted project operators through the database dashboard/service role, but
-- website visitors cannot enumerate or read individual votes.
revoke all on table public.extension_beta_poll_votes from public;
grant insert on table public.extension_beta_poll_votes to anon, authenticated;

create policy "Anyone can submit an anonymous importer preference"
    on public.extension_beta_poll_votes
    for insert
    to anon, authenticated
    with check (preference in ('extension', 'api', 'gemini', 'unsure'));
