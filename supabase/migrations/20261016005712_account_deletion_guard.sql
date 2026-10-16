-- Server-controlled flag keeps checkout and billing webhooks from restoring
-- a subscription while an account deletion is being retried.
alter table public.profiles
    add column if not exists account_deletion_pending boolean not null default false;
