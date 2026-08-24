-- Private, per-user profile photos. The object path is always
-- <authenticated-user-id>/avatar, so no profile-row update is needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'profile-avatars',
    'profile-avatars',
    false,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Users can view their own profile avatar" on storage.objects;
create policy "Users can view their own profile avatar"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

drop policy if exists "Users can upload their own profile avatar" on storage.objects;
create policy "Users can upload their own profile avatar"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

drop policy if exists "Users can replace their own profile avatar" on storage.objects;
create policy "Users can replace their own profile avatar"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    )
    with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

drop policy if exists "Users can delete their own profile avatar" on storage.objects;
create policy "Users can delete their own profile avatar"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );
