-- Supabase projects can carry direct grants from older default privilege
-- settings. Make the poll explicitly write-only for public API roles.
revoke select, update, delete, truncate, references, trigger
    on table public.extension_beta_poll_votes
    from anon, authenticated;

grant insert on table public.extension_beta_poll_votes to anon, authenticated;
