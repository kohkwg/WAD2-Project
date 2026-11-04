-- Go together groups for live mode (4 November 2026). Mirrors the demo backend in
-- client/src/utils/mockApi.js and the rules in client/src/utils/groups.js; the client
-- adapter is client/src/utils/supabaseGroupsApi.js. Needs 20261103120000_hangouts.sql
-- (event kinds, join modes, the shared admission rule) and 20261104142732_group_event_kind.sql.
-- Applied to the hosted project on 4 November 2026; Timothy should still review it.
--
-- A group is an event row (kind 'group') so joining, spots, approvals and leaving reuse
-- registrations. public.groups links it to the official event it is for. Chat messages,
-- before/after ideas, votes and when2meet-style availability get their own tables.
--
-- Security model: the new tables have RLS on, no policies and no table grants, so the
-- browser never reads or writes them directly. Every read and change goes through a
-- SECURITY DEFINER function below that checks auth.uid() and membership.

-- 1. Tables -------------------------------------------------------------------------
create table public.groups (
  event_id          uuid primary key references public.events (id) on delete cascade,
  official_event_id uuid not null references public.events (id) on delete cascade,
  visibility        text not null default 'public' check (visibility in ('public', 'private')),
  -- a capability: only members read it, through group_view()
  invite_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  before_choice     uuid,
  after_choice      uuid,
  created_at        timestamptz not null default now()
);
create index on public.groups (official_event_id);

create table public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (event_id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (btrim(body) <> '' and char_length(body) <= 280),
  created_at  timestamptz not null default now()
);
create index on public.group_messages (group_id, created_at);
create index on public.group_messages (user_id);

create table public.group_ideas (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (event_id) on delete cascade,
  slot          text not null check (slot in ('before', 'after')),
  kind          text not null check (kind in ('deal', 'place', 'custom')),
  ref_id        text check (char_length(ref_id) <= 200),
  name          text not null check (btrim(name) <> '' and char_length(name) <= 80),
  detail        text check (char_length(detail) <= 200),
  price_text    text check (char_length(price_text) <= 60),
  address       text check (char_length(address) <= 200),
  lat           double precision check (lat between 1.144 and 1.494),
  lng           double precision check (lng between 103.535 and 104.131),
  source_url    text check (char_length(source_url) <= 500 and source_url ~ '^https?://'),
  suggested_by  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index on public.group_ideas (group_id, slot);
create index on public.group_ideas (suggested_by);

alter table public.groups
  add constraint groups_before_choice_fkey foreign key (before_choice) references public.group_ideas (id) on delete set null,
  add constraint groups_after_choice_fkey  foreign key (after_choice)  references public.group_ideas (id) on delete set null;
create index on public.groups (before_choice);
create index on public.groups (after_choice);

create table public.group_idea_votes (
  idea_id     uuid not null references public.group_ideas (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create index on public.group_idea_votes (user_id);

-- The 15-minute cells someone is free for one side of the event (an empty array
-- means "can't make it"; no row means they haven't replied).
create table public.group_availability (
  group_id    uuid not null references public.groups (event_id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  slot        text not null check (slot in ('before', 'after')),
  cells       timestamptz[] not null default '{}' check (cardinality(cells) <= 12),
  updated_at  timestamptz not null default now(),
  primary key (group_id, user_id, slot)
);
create index on public.group_availability (user_id);

-- Deleting the official event removes its groups' rows here (cascade); this removes the
-- group events too, with their registrations.
create or replace function public.groups_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.events where id = old.event_id;
  return null;
end $$;
create trigger groups_after_delete after delete on public.groups
  for each row execute function public.groups_after_delete();

alter table public.groups enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_ideas enable row level security;
alter table public.group_idea_votes enable row level security;
alter table public.group_availability enable row level security;
revoke all on public.groups, public.group_messages, public.group_ideas, public.group_idea_votes,
  public.group_availability from anon, authenticated;

-- 2. Access helpers -----------------------------------------------------------------
create or replace function public.is_group_host(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event_id and e.kind::text = 'group' and e.organiser_id = auth.uid());
$$;

-- Host or confirmed member. People with a pending request can see the group but not plan.
create or replace function public.is_group_member(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_group_host(p_event_id) or exists (
    select 1 from public.events e join public.registrations r on r.event_id = e.id
    where e.id = p_event_id and e.kind::text = 'group' and r.user_id = auth.uid() and r.status = 'confirmed'
  );
$$;

-- Public groups are listed like public hangouts; private ones only reach their people.
create or replace function public.event_publicly_listed(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    left join public.hangouts h on h.event_id = e.id
    left join public.groups g on g.event_id = e.id
    where e.id = p_event_id and e.status <> 'draft'
      and (e.kind = 'official' or h.visibility = 'public' or g.visibility = 'public')
  );
$$;

drop policy "Published events are public; drafts and private hangouts visible to their people" on public.events;
create policy "Published events are public; drafts, private hangouts and private groups visible to their people" on public.events
  for select to anon, authenticated using (
    public.event_publicly_listed(id) or organiser_id = (select auth.uid())
    or public.is_event_staff(id) or public.is_hangout_member(id) or public.is_group_member(id)
  );

create or replace function public.can_view_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.event_publicly_listed(p_event_id) or public.is_event_staff(p_event_id)
      or public.is_hangout_member(p_event_id) or public.is_group_member(p_event_id);
$$;

-- A group's capacity includes its host, as for hangouts. Otherwise the 3 November rule.
create or replace function public._admission_status(e public.events, v_registered int)
returns public.registration_status language sql immutable set search_path = '' as $$
  select case
    when coalesce(e.join_mode::text, case when e.requires_approval then 'approval' else 'auto' end) = 'approval' then 'pending'::public.registration_status
    when e.capacity is not null and v_registered + (e.kind::text in ('hangout', 'group'))::int >= e.capacity and e.join_mode = 'open' then null
    when e.capacity is not null and v_registered + (e.kind::text in ('hangout', 'group'))::int >= e.capacity then 'waitlisted'::public.registration_status
    else 'confirmed'::public.registration_status
  end;
$$;

-- The 3 November definition; groups' hosts hold a place and private groups' counts stay hidden.
create or replace function public.event_availability(p_event_ids uuid[])
returns table (
  event_id uuid, capacity int, confirmed int, offered int, pending int,
  waitlisted int, spots_left int
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.capacity,
         (count(r.id) filter (where r.status = 'confirmed'))::int,
         case when public.is_event_organiser(e.id)
              then (count(r.id) filter (where r.status = 'offered'))::int
              else 0 end,
         case when public.is_event_organiser(e.id)
              then (count(r.id) filter (where r.status = 'pending'))::int
              else 0 end,
         (count(r.id) filter (where r.status = 'waitlisted'))::int,
         case when e.capacity is null then null
              else greatest(e.capacity - (e.kind::text in ('hangout', 'group'))::int - count(r.id) filter
                   (where r.status in ('confirmed', 'offered')), 0)::int
         end
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.id = any (p_event_ids)
    and (e.status = 'published' or public.is_event_organiser(e.id))
    and (public.event_publicly_listed(e.id) or public.is_event_staff(e.id)
         or public.is_hangout_member(e.id) or public.is_group_member(e.id))
  group by e.id;
$$;

-- register_for_event: the 3 November definition; the one change (marked) keeps private
-- groups to join_group() with their invite token.
create or replace function public.register_for_event(p_event_id uuid, p_answers jsonb default '[]'::jsonb)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  e        public.events;
  v_status public.registration_status;
  v_held   int;
  v_reg    public.registrations;
  q        record;
begin
  if auth.uid() is null then raise exception 'Sign in to register'; end if;

  select * into e from public.events where id = p_event_id for update;
  if not found or e.status <> 'published' then raise exception 'This event is not open for registration'; end if;
  if e.organiser_id = auth.uid() or public.is_event_staff(p_event_id) then
    raise exception 'Organisers and helpers can''t RSVP to their own event';
  end if;
  -- Group change: private hangouts and private groups are joined only through their invite
  if e.kind::text in ('hangout', 'group') and not public.event_publicly_listed(p_event_id) then
    raise exception 'Use the invite link to join';
  end if;
  if e.registration_closes_at is not null and now() > e.registration_closes_at then raise exception 'Registration has closed'; end if;
  if now() > e.ends_at then raise exception 'This event has ended'; end if;

  for q in select id, prompt from public.event_questions where event_id = p_event_id and required loop
    if not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where a ->> 'question_id' = q.id::text and nullif(a ->> 'answer', '') is not null
    ) then
      raise exception 'Please answer: %', q.prompt;
    end if;
  end loop;

  select count(*) into v_held from public.registrations
  where event_id = p_event_id and status in ('confirmed', 'offered');

  v_status := public._admission_status(e, v_held);
  if v_status is null then raise exception 'This event is full, so it isn''t taking new joins'; end if;

  insert into public.registrations (event_id, user_id, status)
  values (p_event_id, auth.uid(), v_status)
  on conflict (event_id, user_id) do update
    set status = excluded.status, offer_expires_at = null, late_cancel = false,
        created_at = now(), decided_at = null, decided_by = null
    where public.registrations.status in ('cancelled', 'declined', 'expired')
  returning * into v_reg;

  if not found then raise exception 'You already have an RSVP for this event'; end if;

  delete from public.registration_answers where registration_id = v_reg.id;
  insert into public.registration_answers (registration_id, question_id, answer)
  select v_reg.id, q2.id, a -> 'answer'
  from jsonb_array_elements(p_answers) a
  join public.event_questions q2 on q2.id::text = a ->> 'question_id' and q2.event_id = p_event_id;

  return v_reg;
end $$;

-- Who may see a group: anyone signed in for a public one; for a private one, its people
-- (including someone waiting for approval) or someone holding the invite token.
create or replace function public._group_can_view(p_group_id uuid, p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g join public.events e on e.id = g.event_id
    where g.event_id = p_group_id and e.status = 'published'
      and (g.visibility = 'public' or (p_token is not null and g.invite_token = p_token)
           or public.is_group_member(p_group_id)
           or exists (select 1 from public.registrations r where r.event_id = p_group_id and r.user_id = auth.uid()
                      and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')))
  );
$$;

-- 3. Reading groups -------------------------------------------------------------------
-- The same shape as groupView() in mockApi.js, without the official event itself (the
-- client loads that with getEvent). Members can't read each other's registrations, so
-- names and counts come from here.
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
    'commentCount', (select count(*) from public.group_messages m where m.group_id = e.id)
  )
  from public.groups g
  join public.events e on e.id = g.event_id
  left join public.profiles hp on hp.id = e.organiser_id
  where g.event_id = p_group_id;
$$;

-- Upcoming groups you can see, soonest first
create or replace function public.group_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public._group_summary(g.event_id) order by e.starts_at), '[]'::jsonb)
  from public.groups g join public.events e on e.id = g.event_id
  where e.status = 'published' and e.ends_at > now() and public._group_can_view(g.event_id, null);
$$;

-- One group, by id or by invite token
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
  if not public._group_can_view(v_id, p_token) then raise exception 'This group is private. Ask the host for the invite link.'; end if;
  return public._group_summary(v_id) || jsonb_build_object('viaInvite', p_token is not null);
end $$;

-- 4. Starting and joining -------------------------------------------------------------
-- The group copies the event's time, venue and interests; the host holds one of its spots.
create or replace function public.create_group(p_event_id uuid, p_note text default '', p_capacity int default 4,
  p_join_mode text default 'open', p_visibility text default 'public')
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
  if char_length(v_note) > 200 then raise exception 'Keep the note to 200 characters or fewer.'; end if;
  if p_capacity is null or p_capacity not between 2 and 8 then raise exception 'A group has 2 to 8 spots, including you.'; end if;
  if p_join_mode not in ('open', 'auto', 'approval') then raise exception 'Choose how people join.'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Choose who can find the group.'; end if;

  insert into public.events (title, description, starts_at, ends_at, venue_id, capacity, requires_approval, join_mode, status, kind)
  values ('Going to ' || left(t.title, 191), v_note, t.starts_at, t.ends_at, t.venue_id, p_capacity,
          p_join_mode = 'approval', p_join_mode::public.join_mode, 'published', 'group')
  returning id into v_id;
  insert into public.event_interests (event_id, interest_id)
  select v_id, ei.interest_id from public.event_interests ei where ei.event_id = t.id;
  insert into public.groups (event_id, official_event_id, visibility) values (v_id, t.id, p_visibility);
  return v_id;
end $$;

-- Join a group. A private group needs its invite token.
create or replace function public.join_group(p_group_id uuid, p_token text default null)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  g public.groups;
  v_status public.registration_status;
  v_held int;
  v_reg public.registrations;
begin
  if auth.uid() is null then raise exception 'Sign in to join.'; end if;
  select * into g from public.groups where event_id = p_group_id;
  if not found then raise exception 'This group isn’t available any more.'; end if;
  select * into e from public.events where id = p_group_id for update;
  if e.status <> 'published' or now() > e.ends_at then raise exception 'This group isn’t taking joins.'; end if;
  if e.organiser_id = auth.uid() then raise exception 'You’re the host of this group.'; end if;
  if g.visibility = 'private' and p_token is distinct from g.invite_token then
    raise exception 'This group is private. Ask the host for the invite link.';
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
  return v_reg;
end $$;

-- 5. Chat -----------------------------------------------------------------------------
create or replace function public.group_messages_list(p_group_id uuid)
returns table (id uuid, group_id uuid, user_id uuid, name text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._group_can_view(p_group_id, null) then raise exception 'This group is private. Ask the host for the invite link.'; end if;
  return query
    select m.id, m.group_id, m.user_id, coalesce(nullif(p.display_name, ''), 'Someone'), m.body, m.created_at, m.user_id = auth.uid()
    from public.group_messages m left join public.profiles p on p.id = m.user_id
    where m.group_id = p_group_id
    order by m.created_at;
end $$;

create or replace function public.add_group_message(p_group_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_body = '' then raise exception 'Write something first.'; end if;
  if char_length(v_body) > 280 then raise exception 'Keep messages to 280 characters or fewer.'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'Join the group to plan with everyone.'; end if;
  insert into public.group_messages (group_id, user_id, body) values (p_group_id, auth.uid(), v_body) returning id into v_id;
  return v_id;
end $$;

-- Your own messages only
create or replace function public.delete_group_message(p_message_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.group_messages where id = p_message_id and user_id = auth.uid();
$$;

-- 6. Before and after plan ----------------------------------------------------------------
-- Members only. Votes and availability count the current members (host and confirmed).
create or replace function public.group_plan(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_group_member(p_group_id) then raise exception 'Join the group to plan with everyone.'; end if;
  with members as (
    select e.organiser_id as user_id from public.events e where e.id = p_group_id
    union
    select r.user_id from public.registrations r where r.event_id = p_group_id and r.status = 'confirmed'
  )
  select jsonb_build_object(
    'hostId', e.organiser_id,
    'startTime', e.starts_at,
    'endTime', e.ends_at,
    'members', (select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(p.display_name, ''), 'Member')))
                from members m left join public.profiles p on p.id = m.user_id),
    'choices', jsonb_build_object('before', g.before_choice, 'after', g.after_choice),
    'ideas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'slot', i.slot, 'kind', i.kind, 'refId', i.ref_id, 'name', i.name, 'detail', i.detail,
        'priceText', i.price_text, 'address', i.address, 'lat', i.lat, 'lng', i.lng, 'sourceUrl', i.source_url,
        'suggestedBy', i.suggested_by, 'suggestedByName', coalesce(nullif(p.display_name, ''), 'Someone'), 'createdAt', i.created_at,
        'votes', (select count(*) from public.group_idea_votes gv join members m on m.user_id = gv.user_id where gv.idea_id = i.id),
        'myVote', exists (select 1 from public.group_idea_votes gv where gv.idea_id = i.id and gv.user_id = auth.uid())
      ) order by i.created_at)
      from public.group_ideas i left join public.profiles p on p.id = i.suggested_by
      where i.group_id = p_group_id), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_object_agg(x.user_id, x.slots)
      from (select a.user_id, jsonb_object_agg(a.slot, to_jsonb(a.cells)) as slots
            from public.group_availability a join members m on m.user_id = a.user_id
            where a.group_id = p_group_id group by a.user_id) x), '{}'::jsonb)
  ) into v
  from public.groups g join public.events e on e.id = g.event_id
  where g.event_id = p_group_id;
  return v;
end $$;

-- Suggest a place or deal for before or after the event (up to 8 per side, no repeats).
-- The person suggesting it counts as keen.
create or replace function public.suggest_group_idea(p_group_id uuid, p_slot text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_ref text := nullif(btrim(coalesce(p ->> 'refId', '')), '');
  v_kind text := coalesce(p ->> 'kind', 'custom');
  v_url text := nullif(btrim(coalesce(p ->> 'sourceUrl', '')), '');
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then raise exception 'Join the group to plan with everyone.'; end if;
  if p_slot not in ('before', 'after') then raise exception 'Choose before or after the event.'; end if;
  if v_name = '' then raise exception 'Name the place you have in mind.'; end if;
  if char_length(v_name) > 80 then raise exception 'Keep the name to 80 characters or fewer.'; end if;
  if v_kind not in ('deal', 'place', 'custom') then v_kind := 'custom'; end if;
  if v_url is not null and v_url !~ '^https?://' then v_url := null; end if;
  -- One idea at a time per group, so the count and duplicate checks hold
  perform 1 from public.groups where event_id = p_group_id for update;
  if (select count(*) from public.group_ideas where group_id = p_group_id and slot = p_slot) >= 8 then
    raise exception 'This slot already has 8 ideas. Remove one first.';
  end if;
  if exists (select 1 from public.group_ideas where group_id = p_group_id and slot = p_slot
             and ((v_ref is not null and ref_id = v_ref) or lower(name) = lower(v_name))) then
    raise exception 'That place is already suggested.';
  end if;
  insert into public.group_ideas (group_id, slot, kind, ref_id, name, detail, price_text, address, lat, lng, source_url, suggested_by)
  values (p_group_id, p_slot, v_kind, left(v_ref, 200), v_name, left(nullif(btrim(p ->> 'detail'), ''), 200),
          left(nullif(btrim(p ->> 'priceText'), ''), 60), left(nullif(btrim(p ->> 'address'), ''), 200),
          case when (p ->> 'lat') is not null and (p ->> 'lng') is not null then (p ->> 'lat')::float8 end,
          case when (p ->> 'lat') is not null and (p ->> 'lng') is not null then (p ->> 'lng')::float8 end,
          left(v_url, 500), auth.uid())
  returning id into v_id;
  insert into public.group_idea_votes (idea_id, user_id) values (v_id, auth.uid());
  return v_id;
end $$;

-- Mark or unmark an idea as one you're keen on
create or replace function public.vote_group_idea(p_idea_id uuid, p_keen boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group uuid;
begin
  select group_id into v_group from public.group_ideas where id = p_idea_id;
  if v_group is null then raise exception 'That idea was removed.'; end if;
  if not public.is_group_member(v_group) then raise exception 'Join the group to plan with everyone.'; end if;
  if p_keen then
    insert into public.group_idea_votes (idea_id, user_id) values (p_idea_id, auth.uid()) on conflict do nothing;
  else
    delete from public.group_idea_votes where idea_id = p_idea_id and user_id = auth.uid();
  end if;
end $$;

-- The host picks one idea for a side (or clears it with null)
create or replace function public.choose_group_idea(p_group_id uuid, p_slot text, p_idea_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_host(p_group_id) then raise exception 'Only the host picks the plan.'; end if;
  if p_slot not in ('before', 'after') then raise exception 'Choose before or after the event.'; end if;
  if p_idea_id is not null and not exists (select 1 from public.group_ideas where id = p_idea_id and group_id = p_group_id and slot = p_slot) then
    raise exception 'That idea was removed.';
  end if;
  if p_slot = 'before' then
    update public.groups set before_choice = p_idea_id where event_id = p_group_id;
  else
    update public.groups set after_choice = p_idea_id where event_id = p_group_id;
  end if;
end $$;

-- Remove your own idea (the host can remove any). A picked idea is un-picked by the foreign key.
create or replace function public.remove_group_idea(p_idea_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.group_ideas;
begin
  select * into i from public.group_ideas where id = p_idea_id;
  if not found then return; end if;
  if not public.is_group_member(i.group_id) then raise exception 'Join the group to plan with everyone.'; end if;
  if i.suggested_by <> auth.uid() and not public.is_group_host(i.group_id) then raise exception 'You can only remove your own ideas.'; end if;
  delete from public.group_ideas where id = p_idea_id;
end $$;

-- Save the 15-minute cells you're free for one side. Each side is three hours: before
-- ends 15 minutes before the event starts, after begins 15 minutes after it ends
-- (slotCells() in groups.js).
create or replace function public.set_group_availability(p_group_id uuid, p_slot text, p_cells timestamptz[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_anchor timestamptz;
  v_cells timestamptz[];
begin
  if not public.is_group_member(p_group_id) then raise exception 'Join the group to plan with everyone.'; end if;
  if p_slot not in ('before', 'after') then raise exception 'Choose before or after the event.'; end if;
  select * into e from public.events where id = p_group_id;
  v_anchor := case when p_slot = 'before' then e.starts_at - interval '195 minutes' else e.ends_at + interval '15 minutes' end;
  select coalesce(array_agg(distinct c order by c), '{}') into v_cells from unnest(coalesce(p_cells, '{}')) as c;
  if exists (select 1 from unnest(v_cells) as c
             where c < v_anchor or c >= v_anchor + interval '180 minutes'
                or mod(extract(epoch from c - v_anchor)::numeric, 900) <> 0) then
    raise exception 'Those times are outside the planner. Refresh and try again.';
  end if;
  insert into public.group_availability (group_id, user_id, slot, cells) values (p_group_id, auth.uid(), p_slot, v_cells)
  on conflict (group_id, user_id, slot) do update set cells = excluded.cells, updated_at = now();
end $$;

-- 7. Function grants ----------------------------------------------------------------------
-- Postgres lets PUBLIC execute new functions, so take that away first.
revoke execute on function public.groups_after_delete(), public._group_can_view(uuid, text), public._group_summary(uuid)
  from public, anon, authenticated;
revoke execute on function public.group_list(), public.group_view(uuid, text), public.create_group(uuid, text, int, text, text),
  public.join_group(uuid, text), public.group_messages_list(uuid), public.add_group_message(uuid, text),
  public.delete_group_message(uuid), public.group_plan(uuid), public.suggest_group_idea(uuid, text, jsonb),
  public.vote_group_idea(uuid, boolean), public.choose_group_idea(uuid, text, uuid), public.remove_group_idea(uuid),
  public.set_group_availability(uuid, text, timestamptz[]) from public, anon;
grant execute on function public.group_list(), public.group_view(uuid, text), public.create_group(uuid, text, int, text, text),
  public.join_group(uuid, text), public.group_messages_list(uuid), public.add_group_message(uuid, text),
  public.delete_group_message(uuid), public.group_plan(uuid), public.suggest_group_idea(uuid, text, jsonb),
  public.vote_group_idea(uuid, boolean), public.choose_group_idea(uuid, text, uuid), public.remove_group_idea(uuid),
  public.set_group_availability(uuid, text, timestamptz[]) to authenticated;
-- Used by the events read policy, which also applies to signed-out visitors
grant execute on function public.is_group_host(uuid), public.is_group_member(uuid) to anon, authenticated;
