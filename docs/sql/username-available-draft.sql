-- REVIEW ONLY. Run once in the Supabase SQL Editor (hosted change: coordinate with Timothy).
-- Prerequisite: docs/sql/profile-username-draft.sql (the profiles.username column).
-- Lets the Create account and Edit profile forms show "username is available / taken" while
-- someone types. Profiles are private, so the form cannot read other people's usernames itself.
-- Trade-off: anyone can ask whether a username is taken. Usernames are meant to be found by
-- others anyway. Remove the function (and the check in client/src/lib/usernameAvailability.js)
-- to go back to finding out only when saving.
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.profiles
    where username = lower(btrim(p_username))
      and id is distinct from auth.uid()   -- your own current username counts as available
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
