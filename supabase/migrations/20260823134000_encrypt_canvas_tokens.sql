-- Canvas credentials are encrypted by Edge Functions before reaching storage.
alter table public.canvas_connections add column if not exists canvas_token_encrypted text;
alter table public.canvas_connections alter column canvas_token drop not null;
