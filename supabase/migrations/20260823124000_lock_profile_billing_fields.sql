-- Subscription state and Canvas connection metadata are written only by Edge
-- Functions using the service role. Browser clients retain read access to their
-- own profile but cannot elevate subscription status or overwrite billing data.
drop policy if exists "Users can update their own profile" on public.profiles;
