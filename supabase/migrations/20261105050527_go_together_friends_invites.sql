-- Go together: friends-only groups, invites, join messages, host settings and deleting
-- (5 November 2026). Builds on 20261104142907_go_together_groups.sql and mirrors the demo
-- backend in client/src/utils/mockApi.js. Applied to the hosted project on 5 November 2026.
--
-- * A private group is "friends only": the host's friends see it in Community; anyone
--   else needs the invite link. Invited people can always see it.
-- * The host can invite friends; accepting an invite counts as the host's approval.
-- * A join request can carry a short message for the host.
-- * The host can change visibility, who can join, spots and the note, or delete the group;
--   deleting leaves a notice for everyone who was in it, asking or invited.
-- * Only people who have RSVP'd to the event can start a group for it.
-- * Getting into a group (joining, an accepted invite, or the host's approval) RSVPs you to
--   the event too, by the event's own rules, unless you already have an RSVP or it is an
--   open-join event that is full. Required RSVP questions are skipped for these.
--
-- profile_friendships already exists on the hosted project (added from
-- docs/sql/profile-friends-draft.sql); it is created here only where it is missing, with
-- the same definition, so a fresh database gets it too.

-- 1. Friendships (only if missing) and a friendship check -------------------------------
create table if not exists public.profile_friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requester_id in (user_low, user_high))
);
create index if not exists profile_friendships_high on public.profile_friendships(user_high);
alter table public.profile_friendships enable row level security;
revoke all on public.profile_friendships from public, anon, authenticated;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.profile_friendships f
    where f.user_low = least(p_a, p_b) and f.user_high = greatest(p_a, p_b) and f.status = 'accepted'
  );
$$;

-- 2. Tables ---------------------------------------------------------------------------------
create table public.group_invites (
  group_id      uuid not null references public.groups (event_id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  invited_by    uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (group_id, user_id)
);
create index on public.group_invites (user_id) where status = 'pending';
create index on public.group_invites (invited_by);

-- The message someone wrote with their join request
create table public.group_join_notes (
  group_id    uuid not null references public.groups (event_id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (btrim(body) <> '' and char_length(body) <= 200),
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.group_join_notes (user_id);

-- "The group you were in was deleted"; kept as text because the group is gone
create table public.group_notices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  host_name    text not null,
  event_title  text not null,
  deleted_at   timestamptz not null default now(),
  seen         boolean not null default false
);
create index on public.group_notices (user_id) where not seen;

alter table public.group_invites enable row level security;
alter table public.group_join_notes enable row level security;
alter table public.group_notices enable row level security;
revoke all on public.group_invites, public.group_join_notes, public.group_notices from anon, authenticated;

-- 3. Who can see a group ----------------------------------------------------------------------
-- Public: anyone signed in. Friends only: the host's friends, the group's people (including
-- someone waiting for approval), anyone with a pending invite, or anyone with the link.
create or replace function public._group_can_view(p_group_id uuid, p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g join public.events e on e.id = g.event_id
    where g.event_id = p_group_id and e.status = 'published'
      and (g.visibility = 'public' or (p_token is not null and g.invite_token = p_token)
           or public.is_group_member(p_group_id)
           or public.are_friends(e.organiser_id, auth.uid())
           or exists (select 1 from public.registrations r where r.event_id = p_group_id and r.user_id = auth.uid()
                      and r.status in ('pending', 'confirmed', 'waitlisted', 'offered'))
           or exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.user_id = auth.uid() and i.status = 'pending'))
  );
$$;

-- The 4 November summary plus: whether the host is your friend, your pending invite, and
-- (for the host) the join requests with each person's message.
create or replace function public._group_summary(p_group_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id,
    'eventId', g.official_event_id,
    'note', e.description,
    'capacity', e.capacity,
    'spotsLeft', case when e.capacity is null then null else greatest(e.capacity - 1 -
      (select count(*) from public.registrations r where r.event_id = e.id and r.status in ('confirmed', 'offered')), 0) end,
    'joinMode', coalesce(e.join_mode::text, case when e.requires_approval then 'approval' else 'auto' end),
    'visibility', g.visibility,
    'inviteToken', case when public.is_group_member(e.id) then g.invite_token end,
    'createdAt', e.created_at,
    'startTime', e.starts_at,
    'endTime', e.ends_at,
    'host', jsonb_build_object('id', e.organiser_id, 'name', coalesce(nullif(hp.display_name, ''), 'Host')),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.user_id, 'name', coalesce(nullif(p.display_name, ''), 'Member')) order by r.created_at)
      from public.registrations r left join public.profiles p on p.id = r.user_id
      where r.event_id = e.id and r.status = 'confirmed'), '[]'::jsonb),
    'pendingCount', (select count(*) from public.registrations r where r.event_id = e.id and r.status = 'pending'),
    'myStatus', case when e.organiser_id = auth.uid() then 'host' else (
      select r.status::text from public.registrations r
      where r.event_id = e.id and r.user_id = auth.uid() and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')) end,
    'myRsvpId', (
      select r.id from public.registrations r
      where r.event_id = e.id and r.user_id = auth.uid() and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')),
    'myEventStatus', (
      select r.status::text from public.registrations r
      where r.event_id = g.official_event_id and r.user_id = auth.uid() and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')),
    'commentCount', (select count(*) from public.group_messages m where m.group_id = e.id),
    'hostIsFriend', e.organiser_id <> auth.uid() and public.are_friends(e.organiser_id, auth.uid()),
    'myInvite', (
      select jsonb_build_object('id', i.group_id, 'from', jsonb_build_object('id', i.invited_by, 'name', coalesce(nullif(ip.display_name, ''), 'A friend')))
      from public.group_invites i left join public.profiles ip on ip.id = i.invited_by
      where i.group_id = e.id and i.user_id = auth.uid() and i.status = 'pending'),
    'requests', case when e.organiser_id = auth.uid() then coalesce((
      select jsonb_agg(jsonb_build_object('rsvpId', r.id, 'userId', r.user_id, 'name', coalesce(nullif(p.display_name, ''), 'Someone'),
                                          'message', coalesce(n.body, ''), 'createdAt', r.created_at) order by r.created_at)
      from public.registrations r
      left join public.profiles p on p.id = r.user_id
      left join public.group_join_notes n on n.group_id = e.id and n.user_id = r.user_id
      where r.event_id = e.id and r.status = 'pending'), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.groups g
  join public.events e on e.id = g.event_id
  left join public.profiles hp on hp.id = e.organiser_id
  where g.event_id = p_group_id;
$$;

-- group_view's message for a friends-only group someone can't see
create or replace function public.group_view(p_group_id uuid default null, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to see this group.'; end if;
  if p_token is not null then
    select g.event_id into v_id from public.groups g join public.events e on e.id = g.event_id
    where g.invite_token = p_token and e.status = 'published';
    if v_id is null then raise exception 'This invite link isn’t valid any more. Ask the host for a new one.'; end if;
  else
    select g.event_id into v_id from public.groups g join public.events e on e.id = g.event_id
    where g.event_id = p_group_id and e.status = 'published';
    if v_id is null then raise exception 'This group isn’t available any more.'; end if;
  end if;
  if not public._group_can_view(v_id, p_token) then raise exception 'This group is for the host’s friends. Ask them for the invite link.'; end if;
  return public._group_summary(v_id) || jsonb_build_object('viaInvite', p_token is not null);
end $$;

-- 4. Starting a group, with friends invited --------------------------------------------------
drop function public.create_group(uuid, text, int, text, text);
create or replace function public.create_group(p_event_id uuid, p_note text default '', p_capacity int default 4,
  p_join_mode text default 'open', p_visibility text default 'public', p_invite_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t public.events;
  v_id uuid;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then raise exception 'Sign in to start a group.'; end if;
  select * into t from public.events where id = p_event_id and kind = 'official' and status = 'published';
  if not found then raise exception 'Choose the event you want company for.'; end if;
  if t.starts_at <= now() then raise exception 'That event has already started. Choose another one.'; end if;
  if not exists (select 1 from public.registrations r where r.event_id = t.id and r.user_id = auth.uid()
                 and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')) then
    raise exception 'RSVP to this event first, then start a group for it.';
  end if;
  if char_length(v_note) > 200 then raise exception 'Keep the note to 200 characters or fewer.'; end if;
  if p_capacity is null or p_capacity not between 2 and 8 then raise exception 'A group has 2 to 8 spots, including you.'; end if;
  if p_join_mode not in ('open', 'approval') then raise exception 'Choose who can join.'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Choose who can see the group.'; end if;
  if cardinality(coalesce(p_invite_ids, '{}')) > 20 then raise exception 'Invite up to 20 friends at a time.'; end if;

  insert into public.events (title, description, starts_at, ends_at, venue_id, capacity, requires_approval, join_mode, status, kind)
  values ('Going to ' || left(t.title, 191), v_note, t.starts_at, t.ends_at, t.venue_id, p_capacity,
          p_join_mode = 'approval', p_join_mode::public.join_mode, 'published', 'group')
  returning id into v_id;
  insert into public.event_interests (event_id, interest_id)
  select v_id, ei.interest_id from public.event_interests ei where ei.event_id = t.id;
  insert into public.groups (event_id, official_event_id, visibility) values (v_id, t.id, p_visibility);
  -- Quick add: only accepted friends are invited; anyone else in the list is skipped
  insert into public.group_invites (group_id, user_id, invited_by)
  select distinct v_id, f.id, auth.uid() from unnest(coalesce(p_invite_ids, '{}')) as f(id)
  where f.id <> auth.uid() and public.are_friends(auth.uid(), f.id)
  on conflict do nothing;
  return v_id;
end $$;

-- 5. Joining: friends-only rules, invites and the join message -------------------------------
create or replace function public._accept_group_invite(p_group_id uuid)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_held int;
  v_reg public.registrations;
begin
  select * into e from public.events where id = p_group_id for update;
  if e.status <> 'published' or now() > e.ends_at then raise exception 'This group isn’t taking joins.'; end if;
  select * into v_reg from public.registrations where event_id = p_group_id and user_id = auth.uid()
    and status in ('pending', 'confirmed', 'waitlisted', 'offered');
  if v_reg.status is distinct from 'confirmed' then
    select count(*) into v_held from public.registrations where event_id = p_group_id and status in ('confirmed', 'offered');
    if e.capacity is not null and v_held + 1 >= e.capacity then raise exception 'This group is full now. Ask the host to add a spot.'; end if;
    -- The invite is the host's approval, so this is confirmed even in an approval group
    insert into public.registrations (event_id, user_id, status) values (p_group_id, auth.uid(), 'confirmed')
    on conflict (event_id, user_id) do update set status = 'confirmed', offer_expires_at = null, late_cancel = false,
      created_at = now(), decided_at = now(), decided_by = e.organiser_id
    returning * into v_reg;
  end if;
  update public.group_invites set status = 'accepted', responded_at = now() where group_id = p_group_id and user_id = auth.uid();
  return v_reg;
end $$;

drop function public.join_group(uuid, text);
create or replace function public.join_group(p_group_id uuid, p_token text default null, p_note text default null)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  g public.groups;
  v_status public.registration_status;
  v_held int;
  v_reg public.registrations;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in to join.'; end if;
  select * into g from public.groups where event_id = p_group_id;
  if not found then raise exception 'This group isn’t available any more.'; end if;
  if char_length(v_note) > 200 then raise exception 'Keep your message to 200 characters or fewer.'; end if;
  select * into e from public.events where id = p_group_id for update;
  if e.status <> 'published' or now() > e.ends_at then raise exception 'This group isn’t taking joins.'; end if;
  if e.organiser_id = auth.uid() then raise exception 'You’re the host of this group.'; end if;
  -- An invite counts as the host's approval
  if exists (select 1 from public.group_invites where group_id = p_group_id and user_id = auth.uid() and status = 'pending') then
    return public._accept_group_invite(p_group_id);
  end if;
  if g.visibility = 'private' and p_token is distinct from g.invite_token and not public.are_friends(e.organiser_id, auth.uid()) then
    raise exception 'This group is for the host’s friends. Ask them for the invite link.';
  end if;
  select count(*) into v_held from public.registrations where event_id = e.id and status in ('confirmed', 'offered');
  v_status := public._admission_status(e, v_held);
  if v_status is null then raise exception 'This group is full.'; end if;
  insert into public.registrations (event_id, user_id, status) values (e.id, auth.uid(), v_status)
  on conflict (event_id, user_id) do update set status = excluded.status, offer_expires_at = null, late_cancel = false,
    created_at = now(), decided_at = null, decided_by = null
    where public.registrations.status in ('cancelled', 'declined', 'expired')
  returning * into v_reg;
  if not found then raise exception 'You’re already in this group.'; end if;
  if v_note is not null then
    insert into public.group_join_notes (group_id, user_id, body) values (p_group_id, auth.uid(), v_note)
    on conflict (group_id, user_id) do update set body = excluded.body, created_at = now();
  else
    delete from public.group_join_notes where group_id = p_group_id and user_id = auth.uid();
  end if;
  return v_reg;
end $$;

-- Getting into a group RSVPs you to its event. Runs for every path in: an open join, an
-- accepted invite, or the host approving a request (an organiser status update).
create or replace function public.group_member_event_rsvp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
  t public.events;
  v_held int;
  v_status public.registration_status;
begin
  if new.status <> 'confirmed' or (tg_op = 'UPDATE' and old.status = 'confirmed') then return null; end if;
  select * into g from public.groups where event_id = new.event_id;
  if not found then return null; end if;
  if exists (select 1 from public.registrations r where r.event_id = g.official_event_id and r.user_id = new.user_id
             and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')) then return null; end if;
  select * into t from public.events where id = g.official_event_id for update;
  if not found or t.status <> 'published' or now() > t.ends_at then return null; end if;
  if t.registration_closes_at is not null and now() > t.registration_closes_at then return null; end if;
  if exists (select 1 from public.event_members m where m.event_id = t.id and m.user_id = new.user_id) then return null; end if;
  select count(*) into v_held from public.registrations where event_id = t.id and status in ('confirmed', 'offered');
  v_status := public._admission_status(t, v_held);
  if v_status is null then return null; end if; -- open-join event that's full: they can RSVP later
  insert into public.registrations (event_id, user_id, status) values (t.id, new.user_id, v_status)
  on conflict (event_id, user_id) do update set status = excluded.status, offer_expires_at = null, late_cancel = false,
    created_at = now(), decided_at = null, decided_by = null
    where public.registrations.status in ('cancelled', 'declined', 'expired');
  return null;
end $$;
create trigger group_member_event_rsvp after insert or update of status on public.registrations
  for each row execute function public.group_member_event_rsvp();

-- Invites waiting for you, newest first
create or replace function public.group_invites_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.group_id,
      'from', jsonb_build_object('id', i.invited_by, 'name', coalesce(nullif(p.display_name, ''), 'A friend')),
      'createdAt', i.created_at,
      'group', public._group_summary(i.group_id)) order by i.created_at desc), '[]'::jsonb)
  from public.group_invites i
  join public.events e on e.id = i.group_id
  left join public.profiles p on p.id = i.invited_by
  where i.user_id = auth.uid() and i.status = 'pending' and e.status = 'published' and e.ends_at > now();
$$;

-- Accept (join straight away if there's a spot) or decline
create or replace function public.respond_group_invite(p_group_id uuid, p_accept boolean)
returns public.registrations language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.group_invites where group_id = p_group_id and user_id = auth.uid() and status = 'pending') then
    raise exception 'This invite isn’t open any more.';
  end if;
  if p_accept then return public._accept_group_invite(p_group_id); end if;
  update public.group_invites set status = 'declined', responded_at = now() where group_id = p_group_id and user_id = auth.uid();
  return null;
end $$;

-- 6. Host settings and deleting -----------------------------------------------------------------
create or replace function public.update_group_settings(p_group_id uuid, p_visibility text, p_join_mode text, p_capacity int, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_members int;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_group_host(p_group_id) then raise exception 'Only the host can change the group.'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Choose who can see the group.'; end if;
  if p_join_mode not in ('open', 'approval') then raise exception 'Choose who can join.'; end if;
  if p_capacity is null or p_capacity not between 2 and 8 then raise exception 'A group has 2 to 8 spots, including you.'; end if;
  if char_length(v_note) > 200 then raise exception 'Keep the note to 200 characters or fewer.'; end if;
  perform 1 from public.events where id = p_group_id for update;
  select 1 + count(*) into v_members from public.registrations where event_id = p_group_id and status in ('confirmed', 'offered');
  if p_capacity < v_members then raise exception '% people are already in, so keep at least % spots.', v_members, v_members; end if;
  update public.events set capacity = p_capacity, join_mode = p_join_mode::public.join_mode,
    requires_approval = (p_join_mode = 'approval'), description = v_note
  where id = p_group_id;
  update public.groups set visibility = p_visibility where event_id = p_group_id;
end $$;

-- Deletes the group (its event row, registrations, chat, plan and invites go with it) and
-- leaves a notice for everyone who was in it, asking to join or invited
create or replace function public.delete_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_host text;
  v_event text;
begin
  if not public.is_group_host(p_group_id) then raise exception 'Only the host can delete the group.'; end if;
  select * into e from public.events where id = p_group_id for update;
  select coalesce(nullif(p.display_name, ''), 'The host') into v_host from public.profiles p where p.id = e.organiser_id;
  select o.title into v_event from public.groups g join public.events o on o.id = g.official_event_id where g.event_id = p_group_id;
  insert into public.group_notices (user_id, host_name, event_title)
  select distinct u.user_id, coalesce(v_host, 'The host'), coalesce(v_event, 'an event') from (
    select r.user_id from public.registrations r where r.event_id = p_group_id and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')
    union
    select i.user_id from public.group_invites i where i.group_id = p_group_id and i.status = 'pending'
  ) u where u.user_id <> e.organiser_id;
  -- Deleting the groups row runs groups_after_delete, which removes the event row
  delete from public.groups where event_id = p_group_id;
end $$;

create or replace function public.group_notices_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'hostName', n.host_name, 'eventTitle', n.event_title, 'deletedAt', n.deleted_at)
    order by n.deleted_at desc), '[]'::jsonb)
  from public.group_notices n where n.user_id = auth.uid() and not n.seen;
$$;

create or replace function public.dismiss_group_notice(p_notice_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.group_notices set seen = true where id = p_notice_id and user_id = auth.uid();
$$;

-- 7. Grants --------------------------------------------------------------------------------------
revoke execute on function public._accept_group_invite(uuid), public.group_member_event_rsvp() from public, anon, authenticated;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_group(uuid, text, int, text, text, uuid[]), public.join_group(uuid, text, text),
  public.group_invites_list(), public.respond_group_invite(uuid, boolean), public.update_group_settings(uuid, text, text, int, text),
  public.delete_group(uuid), public.group_notices_list(), public.dismiss_group_notice(uuid) from public, anon;
grant execute on function public.create_group(uuid, text, int, text, text, uuid[]), public.join_group(uuid, text, text),
  public.group_invites_list(), public.respond_group_invite(uuid, boolean), public.update_group_settings(uuid, text, text, int, text),
  public.delete_group(uuid), public.group_notices_list(), public.dismiss_group_notice(uuid) to authenticated;
