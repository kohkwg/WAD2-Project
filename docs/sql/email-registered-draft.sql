-- REVIEW ONLY. Run once in the Supabase SQL Editor (hosted change: coordinate with Timothy).
-- Lets the sign-in form say "no account with that email" or "wrong password" instead of
-- Supabase's generic "Invalid login credentials".
-- Trade-off: anyone can ask whether an email is registered. Remove this function (and the
-- check in client/src/utils/supabaseApi.js signIn) to go back to the generic message.
create or replace function public.email_registered(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(btrim(p_email))
  );
$$;

revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;
