-- A student-controlled name for the DueVinci profile surface. Keep this in
-- public.profiles instead of exposing auth user metadata to other users.
alter table public.profiles
    add column if not exists display_name text;

alter table public.profiles
    drop constraint if exists profiles_display_name_length;

alter table public.profiles
    add constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 80);

-- New OAuth and email accounts get a sensible initial value when the provider
-- supplies one. Existing accounts keep null and use the client fallback until
-- the student chooses a name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (user_id, display_name)
    values (
        new.id,
        nullif(
            left(
                btrim(coalesce(
                    new.raw_user_meta_data ->> 'full_name',
                    new.raw_user_meta_data ->> 'name',
                    split_part(coalesce(new.email, ''), '@', 1)
                )),
                80
            ),
            ''
        )
    )
    on conflict (user_id) do nothing;
    return new;
end;
$$;
