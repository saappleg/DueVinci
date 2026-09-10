-- Allow the importer preference poll to record more than one selected path.
alter table public.extension_beta_poll_votes
    add column if not exists preferences text[];

update public.extension_beta_poll_votes
set preferences = array[preference]::text[]
where preferences is null;

alter table public.extension_beta_poll_votes
    alter column preferences set default '{}'::text[],
    alter column preferences set not null;

alter table public.extension_beta_poll_votes
    drop constraint if exists extension_beta_poll_votes_preferences_check;

alter table public.extension_beta_poll_votes
    add constraint extension_beta_poll_votes_preferences_check
    check (
        cardinality(preferences) between 1 and 4
        and preferences <@ array['extension', 'api', 'gemini', 'unsure']::text[]
    );

drop policy if exists "Anyone can submit an anonymous importer preference"
    on public.extension_beta_poll_votes;

create policy "Anyone can submit anonymous importer preferences"
    on public.extension_beta_poll_votes
    for insert to anon, authenticated
    with check (
        preference in ('extension', 'api', 'gemini', 'unsure')
        and cardinality(preferences) between 1 and 4
        and preferences <@ array['extension', 'api', 'gemini', 'unsure']::text[]
    );
