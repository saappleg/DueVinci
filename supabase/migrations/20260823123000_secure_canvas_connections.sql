-- Canvas personal-access tokens must never be readable by the browser.
create table if not exists public.canvas_connections (
    user_id uuid primary key references auth.users(id) on delete cascade,
    canvas_domain text not null,
    canvas_token text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.canvas_connections enable row level security;

-- Move any existing Dev connections out of profiles, then clear the exposed copy.
insert into public.canvas_connections (user_id, canvas_domain, canvas_token, updated_at)
select user_id, canvas_domain, canvas_token, now()
from public.profiles
where canvas_domain is not null and canvas_token is not null
on conflict (user_id) do update
set canvas_domain = excluded.canvas_domain,
    canvas_token = excluded.canvas_token,
    updated_at = excluded.updated_at;

update public.profiles set canvas_token = null where canvas_token is not null;
