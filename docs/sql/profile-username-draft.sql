-- REVIEW ONLY. Do not apply without Timothy/user coordination and hosted-history review.
-- Prerequisite: docs/sql/recommendation-evidence-draft.sql, including its profile RPC.
-- Existing accounts keep a NULL username until they choose one. No identity changes.
begin;

alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format
  check (username is null or (username = lower(username) and username ~ '^[a-z0-9_]{3,20}$'));
alter table public.profiles add constraint profiles_username_unique unique (username);

-- Caller RLS governs the update; concurrent claims are settled by the unique constraint.
-- Both operations share one transaction: a duplicate username rolls back all profile edits.
create function public.update_profile_with_username(
  p_username text, p_display_name text, p_postal_code text,
  p_lat double precision, p_lng double precision, p_interests text[]
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_username text := nullif(lower(btrim(p_username)), '');
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if v_username is not null and v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Use 3–20 letters, numbers or underscores.' using errcode = '22023';
  end if;
  perform public.update_recommendation_profile(p_display_name, p_postal_code, p_lat, p_lng, p_interests);
  update public.profiles set username = v_username where id = v_uid;
  if not found then raise exception 'Profile unavailable'; end if;
end $$;
revoke all on function public.update_profile_with_username(text, text, text, double precision, double precision, text[])
  from public, anon, authenticated;
grant execute on function public.update_profile_with_username(text, text, text, double precision, double precision, text[])
  to authenticated;

-- No new read policy, people-directory endpoint or exposure of private profile fields.
commit;
