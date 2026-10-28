-- REVIEW DRAFT ONLY. Not an applied migration or verified hosted contract.
-- Confirm hosted schema and registration/check-in rules with Timothy.
-- Test on an isolated Supabase/Postgres database with authenticated roles first.
-- Assumes public.profiles, public.events, public.registrations, public.check_ins exist.
-- Do not run on the shared database until reviewed.

begin;

create table public.user_event_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  saved_at timestamptz,
  save_active boolean not null default false,
  dismissed_at timestamptz,
  dismissed boolean not null default false,
  first_confirmed_at timestamptz,
  primary key (user_id, event_id),
  check (not save_active or saved_at is not null),
  check (not dismissed or dismissed_at is not null)
);

alter table public.user_event_preferences enable row level security;
revoke all on public.user_event_preferences from public, anon, authenticated;
grant select on public.user_event_preferences to authenticated;

create policy "Read own recommendation preferences"
  on public.user_event_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No direct insert/update/delete grants. RPCs own identity and timestamps.
-- Existing registrations and check-ins remain the authoritative sources.

-- Scoring metadata only: do not change registration lifecycle timestamps/statuses.
-- Explicit selections come from profile_interests -> interests.slug, NEVER
-- profiles.interest_weights (which contains legacy behavioural boosts).
create function public.capture_recommendation_first_confirmation()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' then
    insert into public.user_event_preferences as current_pref
      (user_id, event_id, first_confirmed_at)
    values (new.user_id, new.event_id, statement_timestamp())
    on conflict (user_id, event_id) do update set
      first_confirmed_at = coalesce(current_pref.first_confirmed_at, excluded.first_confirmed_at);
  end if;
  return null;
end $$;

revoke all on function public.capture_recommendation_first_confirmation()
  from public, anon, authenticated;
create trigger capture_recommendation_first_confirmation
  after insert or update of status on public.registrations
  for each row execute function public.capture_recommendation_first_confirmation();

-- Best-known dates for CURRENTLY confirmed rows only. decided_at is the latest
-- status transition, not necessarily the first-ever confirmation. created_at may
-- have been reset on re-registration. Earlier overwritten history is unavailable.
-- Do not backfill cancelled/pending/offered rows from unrelated decision dates.
insert into public.user_event_preferences as current_pref
  (user_id, event_id, first_confirmed_at)
select user_id, event_id, coalesce(decided_at, created_at)
from public.registrations where status = 'confirmed'
on conflict (user_id, event_id) do update set
  first_confirmed_at = coalesce(current_pref.first_confirmed_at, excluded.first_confirmed_at);

create function public.get_recommendation_event_evidence(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pref public.user_event_preferences;
  v_reg public.registrations;
  v_check public.check_ins;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  -- A user may read published events or events with their own historical records.
  if not exists (
       select 1 from public.events where id = p_event_id and status = 'published'
     )
     and not exists (
       select 1 from public.user_event_preferences
       where user_id = v_uid and event_id = p_event_id
     )
     and not exists (
       select 1 from public.registrations
       where user_id = v_uid and event_id = p_event_id
     ) then
    raise exception 'Event unavailable' using errcode = '42501';
  end if;

  select * into v_pref
  from public.user_event_preferences
  where user_id = v_uid and event_id = p_event_id;

  select * into v_reg
  from public.registrations
  where user_id = v_uid and event_id = p_event_id;

  select * into v_check
  from public.check_ins
  where user_id = v_uid
    and event_id = p_event_id
    and registration_id = v_reg.id;

  return jsonb_build_object(
    'eventId', p_event_id,
    'save', jsonb_build_object(
      'active', coalesce(v_pref.save_active, false),
      'timestamp', v_pref.saved_at
    ),
    'rsvp', jsonb_build_object(
      -- Only confirmed registrations contribute RSVP evidence.
      'active', coalesce(v_reg.status = 'confirmed', false),
      -- Preserve the first date even while inactive; only active evidence earns points.
      'timestamp', v_pref.first_confirmed_at
    ),
    'attendance', jsonb_build_object(
      -- Conservative policy: any fraud-flagged check-in is excluded.
      'verified', v_check.id is not null
        and not coalesce(v_check.fraud_flag, true),
      'timestamp', v_check.checked_in_at
    ),
    'dismissed', coalesce(v_pref.dismissed, false)
  );
end $$;

revoke all on function public.get_recommendation_event_evidence(uuid)
  from public, anon, authenticated;
grant execute on function public.get_recommendation_event_evidence(uuid)
  to authenticated;

create function public.set_recommendation_event_preference(
  p_event_id uuid,
  p_action text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  if p_action is null
     or p_action not in ('save', 'unsave', 'dismiss', 'undo_dismiss') then
    raise exception 'Unsupported event preference action' using errcode = '22023';
  end if;

  -- Enforce the same event-access rule as the reader.
  perform public.get_recommendation_event_evidence(p_event_id);

  -- The unique (user_id, event_id) key serializes conflicting upserts.
  -- Actions touching save state do not overwrite dismissal state, and vice versa.
  insert into public.user_event_preferences as current_pref
    (user_id, event_id, saved_at, save_active, dismissed_at, dismissed)
  values (
    v_uid,
    p_event_id,
    case when p_action = 'save' then v_now end,
    p_action = 'save',
    case when p_action = 'dismiss' then v_now end,
    p_action = 'dismiss'
  )
  on conflict (user_id, event_id) do update set
    saved_at = case
      when p_action = 'save' then coalesce(current_pref.saved_at, v_now)
      else current_pref.saved_at
    end,
    save_active = case
      when p_action = 'save' then true
      when p_action = 'unsave' then false
      else current_pref.save_active
    end,
    dismissed_at = case
      when p_action = 'dismiss' and not current_pref.dismissed then v_now
      else current_pref.dismissed_at
    end,
    dismissed = case
      when p_action = 'dismiss' then true
      when p_action = 'undo_dismiss' then false
      else current_pref.dismissed
    end;

  return public.get_recommendation_event_evidence(p_event_id);
end $$;

revoke all on function public.set_recommendation_event_preference(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_recommendation_event_preference(uuid, text)
  to authenticated;

-- Atomically save profile details and explicit choices under the caller's RLS.
-- No legacy interest_weights are read, migrated, or overwritten.
create function public.update_recommendation_profile(
  p_display_name text, p_postal_code text, p_lat double precision,
  p_lng double precision, p_interests text[]
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_interests is null or exists (
    select 1 from unnest(p_interests) as selected(slug)
    where selected.slug is null or not exists (
      select 1 from public.interests i where i.slug = selected.slug
    )
  ) then raise exception 'Invalid interest selection' using errcode = '22023'; end if;

  update public.profiles set display_name = p_display_name,
    postal_code = p_postal_code, lat = p_lat, lng = p_lng where id = v_uid;
  if not found then raise exception 'Profile unavailable'; end if;
  delete from public.profile_interests where profile_id = v_uid;
  insert into public.profile_interests (profile_id, interest_id)
    select v_uid, i.id from public.interests i where i.slug = any(p_interests);
end $$;
revoke all on function public.update_recommendation_profile(text, text, double precision, double precision, text[])
  from public, anon, authenticated;
grant execute on function public.update_recommendation_profile(text, text, double precision, double precision, text[])
  to authenticated;

commit;
