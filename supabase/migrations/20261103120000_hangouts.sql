-- Hangout template (OpenJio integration, 3 November 2026). Promoted from the review
-- draft on the requesting team member's explicit approval to build live mode; Timothy
-- should still review it. Check hosted migration history (supabase migration list)
-- before pushing. Adds hangout events, the Open
-- join mode, private invites, group availability, plans with versioned votes and
-- confirmation. Mirrors client/src/utils/{hangouts,hangoutSlots,itinerary}.js and
-- the demo backend in client/src/utils/mockApi.js.
--
-- Security model: every mutation goes through a SECURITY DEFINER function that checks
-- auth.uid(); new tables allow SELECT only through RLS. Raw free times are readable by
-- their owner only; the group gets aggregate counts from hangout_heatmap().
-- Limit: plan retiming (travel, waits, meal windows) stays in the application. The
-- database rechecks host authority, stage, slot bounds, stop references, the 6-stop
-- cap, versions and revisions, but not the full timing rules.

-- 1. Types and event columns ----------------------------------------------------
create type public.event_kind as enum ('official', 'hangout');
create type public.join_mode  as enum ('open', 'auto', 'approval');

alter table public.events
  add column kind      public.event_kind not null default 'official',
  -- null keeps the existing behaviour derived from requires_approval
  add column join_mode public.join_mode,
  add constraint events_join_mode_matches_approval
    check (join_mode is null or (join_mode = 'approval') = requires_approval);

-- An event's kind is fixed at creation; direct organiser updates can't convert it.
create or replace function public.events_kind_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.kind := old.kind;
  return new;
end $$;
create trigger events_kind_immutable before update of kind on public.events
  for each row execute function public.events_kind_immutable();

-- 2. Hangout tables -------------------------------------------------------------
create table public.hangouts (
  event_id           uuid primary key references public.events (id) on delete cascade,
  mode               text not null check (mode in ('group', 'public', 'solo')),
  visibility         text not null check (visibility in ('private', 'public')),
  stage              text not null check (stage in ('collecting', 'voting', 'final', 'ended', 'cancelled')),
  date_start         date,
  date_end           date,
  locked_start       timestamptz,
  locked_end         timestamptz,
  invite_token       text unique,
  meeting_point      text not null default '' check (char_length(meeting_point) <= 120),
  plan_method        text check (plan_method in ('beam', 'manual')),
  plan_options       jsonb not null default '{}'::jsonb,
  plan_changed_at    timestamptz,
  plan_finalized_at  timestamptz,
  plan_ever_final    boolean not null default false,
  revision           int not null default 0,
  created_at         timestamptz not null default now(),
  check ((visibility = 'public') = (mode = 'public')),
  check (mode <> 'group' or (date_start is not null and date_end is not null and date_end >= date_start and date_end - date_start <= 6)),
  check (mode = 'group' or (locked_start is not null and locked_end is not null)),
  check ((locked_start is null) = (locked_end is null)),
  check (locked_start is null or (locked_end > locked_start and locked_end - locked_start between interval '1 hour' and interval '12 hours')),
  check (stage <> 'collecting' or (mode = 'group' and locked_start is null)),
  check ((invite_token is not null) = (mode = 'group'))
);

create table public.hangout_member_settings (
  event_id  uuid not null references public.hangouts (event_id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  required  boolean not null default false,
  primary key (event_id, user_id)
);

-- A reply row distinguishes "no reply" from "replied with no free time".
create table public.hangout_replies (
  event_id      uuid not null references public.hangouts (event_id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  responded_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.hangout_free_blocks (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null,
  user_id    uuid not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  check (ends_at > starts_at),
  foreign key (event_id, user_id) references public.hangout_replies (event_id, user_id) on delete cascade
);
create index on public.hangout_free_blocks (event_id, user_id);

-- Itinerary-only places: never listed in Discover or used for generation.
create table public.hangout_places (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references public.hangouts (event_id) on delete cascade,
  name      text not null check (btrim(name) <> '' and char_length(name) <= 80),
  address   text not null default '' check (char_length(address) <= 200),
  latitude  double precision not null check (latitude between 1.144 and 1.494),
  longitude double precision not null check (longitude between 103.535 and 104.131),
  minutes   int not null check (minutes between 15 and 360),
  kind      text not null default 'activity' check (kind in ('meal', 'activity')),
  opens_at  time,
  closes_at time,
  check ((opens_at is null) = (closes_at is null)),
  check (closes_at is null or closes_at > opens_at)
);

create table public.hangout_stops (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.hangouts (event_id) on delete cascade,
  position      int not null check (position between 0 and 5),
  ref_event_id  uuid references public.events (id) on delete set null,
  ref_place_id  uuid references public.hangout_places (id) on delete cascade,
  version       int not null default 1 check (version > 0),
  -- a deleted Official event leaves a "missing" stop that blocks confirmation
  check (ref_place_id is null or ref_event_id is null),
  unique (event_id, position) deferrable initially deferred
);

create table public.hangout_votes (
  stop_id   uuid not null references public.hangout_stops (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  version   int not null,
  value     smallint not null check (value in (-1, 1)),
  voted_at  timestamptz not null default now(),
  primary key (stop_id, user_id)
);

-- 3. Access helpers ---------------------------------------------------------------
create or replace function public.is_hangout_host(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event_id and e.kind = 'hangout' and e.organiser_id = auth.uid());
$$;

-- Host or confirmed member. Pending or waitlisted people can't see private plans.
create or replace function public.is_hangout_member(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_hangout_host(p_event_id) or exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id and r.user_id = auth.uid() and r.status = 'confirmed'
  );
$$;

create or replace function public.event_publicly_listed(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e left join public.hangouts h on h.event_id = e.id
    where e.id = p_event_id and e.status <> 'draft' and (e.kind = 'official' or h.visibility = 'public')
  );
$$;

-- Private and solo hangouts disappear from public reads, including the security-invoker
-- events_with_counts view, for everyone except the host, staff and confirmed members.
drop policy "Published events are public; drafts visible to the team" on public.events;
create policy "Published events are public; drafts and private hangouts visible to their people" on public.events
  for select to anon, authenticated using (
    public.event_publicly_listed(id) or organiser_id = (select auth.uid())
    or public.is_event_staff(id) or public.is_hangout_member(id)
  );

create or replace function public.can_view_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.event_publicly_listed(p_event_id) or public.is_event_staff(p_event_id) or public.is_hangout_member(p_event_id);
$$;

alter table public.hangouts enable row level security;
alter table public.hangout_member_settings enable row level security;
alter table public.hangout_replies enable row level security;
alter table public.hangout_free_blocks enable row level security;
alter table public.hangout_places enable row level security;
alter table public.hangout_stops enable row level security;
alter table public.hangout_votes enable row level security;

create policy "Hangout facts for its people, or anyone for an Open Jio" on public.hangouts
  for select to anon, authenticated using (visibility = 'public' or public.is_hangout_member(event_id));
create policy "Members see required flags" on public.hangout_member_settings
  for select to authenticated using (public.is_hangout_member(event_id));
create policy "Members see who replied" on public.hangout_replies
  for select to authenticated using (public.is_hangout_member(event_id));
create policy "Only you read your own free times" on public.hangout_free_blocks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Members see the plan's places" on public.hangout_places
  for select to authenticated using (public.is_hangout_member(event_id));
create policy "Members see the plan" on public.hangout_stops
  for select to authenticated using (public.is_hangout_member(event_id));
create policy "Members see votes" on public.hangout_votes
  for select to authenticated using (exists (select 1 from public.hangout_stops s where s.id = stop_id and public.is_hangout_member(s.event_id)));

-- The invite token is a capability: members read it through hangouts, but never anon.
revoke all on public.hangouts, public.hangout_member_settings, public.hangout_replies, public.hangout_free_blocks,
  public.hangout_places, public.hangout_stops, public.hangout_votes from anon, authenticated;
grant select (event_id, mode, visibility, stage, date_start, date_end, locked_start, locked_end, meeting_point,
  plan_method, plan_options, plan_changed_at, plan_finalized_at, plan_ever_final, revision, created_at) on public.hangouts to anon, authenticated;
grant select on public.hangout_member_settings, public.hangout_replies, public.hangout_free_blocks,
  public.hangout_places, public.hangout_stops, public.hangout_votes to authenticated;

create or replace function public.hangout_invite_token(p_event_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select h.invite_token from public.hangouts h where h.event_id = p_event_id and public.is_hangout_host(p_event_id);
$$;

-- 4. Creation and joining -----------------------------------------------------------
create or replace function public.create_hangout(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_mode text := p ->> 'mode';
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_join public.join_mode;
  v_capacity int;
  v_start timestamptz;
  v_end timestamptz;
  v_date_start date;
  v_date_end date;
  v_venue uuid;
  v_event uuid;
  v_tags text[] := coalesce(array(select jsonb_array_elements_text(p -> 'tags')), '{}');
begin
  if auth.uid() is null then raise exception 'Sign in to create a hangout'; end if;
  if v_mode not in ('group', 'public', 'solo') then raise exception 'Choose who this hangout is for'; end if;
  if v_title = '' or char_length(v_title) > 60 then raise exception 'Give the hangout a title of up to 60 characters'; end if;
  if char_length(btrim(coalesce(p ->> 'description', ''))) > 200 then raise exception 'Keep the description to 200 characters'; end if;
  if cardinality(v_tags) not between 1 and 5 or exists (select 1 from unnest(v_tags) t where not exists (select 1 from public.interests i where i.slug = t)) then
    raise exception 'Pick 1 to 5 known interests';
  end if;
  v_join := case when v_mode = 'solo' then 'open' else coalesce((p ->> 'joinMode')::public.join_mode, 'open') end;
  v_capacity := case when v_mode = 'solo' then 1 else (p ->> 'capacity')::int end;
  if v_mode <> 'solo' and (v_capacity is null or v_capacity not between 2 and 8) then raise exception 'Choose 2 to 8 people'; end if;
  if v_mode = 'group' then
    v_date_start := (p ->> 'dateStart')::date;
    v_date_end := (p ->> 'dateEnd')::date;
    if v_date_start < (now() at time zone 'Asia/Singapore')::date then raise exception 'The first day can''t be in the past'; end if;
    if v_date_end < v_date_start or v_date_end - v_date_start > 6 then raise exception 'Choose up to 7 days'; end if;
    v_start := v_date_start::timestamp at time zone 'Asia/Singapore';
    v_end := (v_date_end + 1)::timestamp at time zone 'Asia/Singapore' - interval '1 minute';
  else
    v_start := (p ->> 'startTime')::timestamptz;
    v_end := (p ->> 'endTime')::timestamptz;
    if v_start <= now() then raise exception 'The start time must be in the future'; end if;
    if v_end - v_start not between interval '1 hour' and interval '12 hours' then raise exception 'Plan between 1 and 12 hours'; end if;
  end if;
  if (p #>> '{venue,lat}') is null or (p #>> '{venue,lng}') is null then raise exception 'Choose a start area with a map location'; end if;

  insert into public.venues (name, address, latitude, longitude)
  values (left(coalesce(p #>> '{venue,name}', 'Start area'), 200), p #>> '{venue,address}', (p #>> '{venue,lat}')::float8, (p #>> '{venue,lng}')::float8)
  returning id into v_venue;
  insert into public.events (title, description, starts_at, ends_at, venue_id, capacity, requires_approval, join_mode, status, kind)
  values (v_title, btrim(coalesce(p ->> 'description', '')), v_start, v_end, v_venue, v_capacity, v_join = 'approval', v_join, 'published', 'hangout')
  returning id into v_event;
  -- Same cleanup contract as create_event_with_details: deleting the hangout removes its start-area venue
  insert into public.event_created_venues (venue_id, original_event_id) values (v_venue, v_event);
  insert into public.event_interests (event_id, interest_id) select v_event, i.id from public.interests i where i.slug = any (v_tags);
  insert into public.hangouts (event_id, mode, visibility, stage, date_start, date_end, locked_start, locked_end, invite_token)
  values (v_event, v_mode, case when v_mode = 'public' then 'public' else 'private' end,
          case when v_mode = 'group' then 'collecting' else 'voting' end, v_date_start, v_date_end,
          case when v_mode = 'group' then null else v_start end, case when v_mode = 'group' then null else v_end end,
          case when v_mode = 'group' then replace(gen_random_uuid()::text, '-', '') else null end);
  return v_event;
end $$;

-- Invite preview without joining. Returns only what a friend needs to decide.
create or replace function public.preview_hangout_invite(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('eventId', e.id, 'title', e.title, 'description', e.description,
    'startsAt', e.starts_at, 'endsAt', e.ends_at, 'capacity', e.capacity, 'joinMode', coalesce(e.join_mode::text, case when e.requires_approval then 'approval' else 'auto' end),
    'mode', h.mode, 'dateStart', h.date_start, 'dateEnd', h.date_end, 'stage', h.stage,
    'lockedStart', h.locked_start, 'lockedEnd', h.locked_end, 'startArea', v.name, 'startAddress', v.address,
    'tags', coalesce((select jsonb_agg(i.slug order by i.slug) from public.event_interests ei join public.interests i on i.id = ei.interest_id where ei.event_id = e.id), '[]'::jsonb),
    'isHost', coalesce(e.organiser_id = auth.uid(), false),
    'myStatus', (select r.status from public.registrations r where r.event_id = e.id and r.user_id = auth.uid()),
    'confirmed', (select count(*) from public.registrations r where r.event_id = e.id and r.status = 'confirmed'))
  from public.hangouts h join public.events e on e.id = h.event_id left join public.venues v on v.id = e.venue_id
  where h.invite_token = p_token and e.status = 'published' and h.stage not in ('ended', 'cancelled');
$$;

-- Shared admission rule. Open joins never queue: a full open event refuses.
-- A hangout's capacity includes its host, who holds one place without a registration.
create or replace function public._admission_status(e public.events, v_registered int)
returns public.registration_status language sql immutable set search_path = '' as $$
  select case
    when coalesce(e.join_mode::text, case when e.requires_approval then 'approval' else 'auto' end) = 'approval' then 'pending'::public.registration_status
    when e.capacity is not null and v_registered + (e.kind = 'hangout')::int >= e.capacity and e.join_mode = 'open' then null
    when e.capacity is not null and v_registered + (e.kind = 'hangout')::int >= e.capacity then 'waitlisted'::public.registration_status
    else 'confirmed'::public.registration_status
  end;
$$;

-- register_for_event: the live 22 October definition with the marked hangout changes.
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
  -- Hangout change: private and solo hangouts are joined only through their invite
  if e.kind = 'hangout' and not public.event_publicly_listed(p_event_id) then
    raise exception 'Use the invite link to join this hangout';
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

  -- Hangout change: one admission rule, including the Open join mode
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

create or replace function public.join_hangout_by_invite(p_token text)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  h public.hangouts;
  v_status public.registration_status;
  v_held int;
  v_reg public.registrations;
begin
  if auth.uid() is null then raise exception 'Sign in to join'; end if;
  select * into h from public.hangouts where invite_token = p_token;
  if not found then raise exception 'This invite link isn''t valid any more'; end if;
  select * into e from public.events where id = h.event_id for update;
  if e.status <> 'published' or h.stage in ('ended', 'cancelled') or now() > e.ends_at then raise exception 'This hangout isn''t taking joins'; end if;
  if e.organiser_id = auth.uid() then raise exception 'You''re the host of this hangout'; end if;
  select count(*) into v_held from public.registrations where event_id = e.id and status in ('confirmed', 'offered');
  v_status := public._admission_status(e, v_held);
  if v_status is null then raise exception 'This hangout is full'; end if;
  insert into public.registrations (event_id, user_id, status) values (e.id, auth.uid(), v_status)
  on conflict (event_id, user_id) do update set status = excluded.status, offer_expires_at = null, late_cancel = false, created_at = now(), decided_at = null, decided_by = null
    where public.registrations.status in ('cancelled', 'declined', 'expired')
  returning * into v_reg;
  if not found then raise exception 'You''re already in this hangout'; end if;
  return v_reg;
end $$;

-- Members can't read each other's registrations, so the people list comes from here:
-- names, role, required flag and whether they've replied (never their free times).
create or replace function public.hangout_members(p_event_id uuid)
returns table (user_id uuid, display_name text, role text, required boolean, responded boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(nullif(p.display_name, ''), 'Member'), m.role,
         m.role = 'host' or coalesce(s.required, false),
         exists (select 1 from public.hangout_replies hr where hr.event_id = p_event_id and hr.user_id = m.user_id)
  from (
    select e.organiser_id as user_id, 'host'::text as role from public.events e where e.id = p_event_id and e.kind = 'hangout'
    union
    select r.user_id, 'member' from public.registrations r where r.event_id = p_event_id and r.status = 'confirmed'
  ) m
  left join public.profiles p on p.id = m.user_id
  left join public.hangout_member_settings s on s.event_id = p_event_id and s.user_id = m.user_id
  where public.is_hangout_member(p_event_id)
  order by m.role, 2;
$$;

-- Availability counts: a hangout's host holds one place, and private hangouts' counts
-- are hidden from people who can't see them. Otherwise the 22 October definition.
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
              else greatest(e.capacity - (e.kind = 'hangout')::int - count(r.id) filter
                   (where r.status in ('confirmed', 'offered')), 0)::int
         end
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.id = any (p_event_ids)
    and (e.status = 'published' or public.is_event_organiser(e.id))
    and (public.event_publicly_listed(e.id) or public.is_event_staff(e.id) or public.is_hangout_member(e.id))
  group by e.id;
$$;

-- 5. Availability -----------------------------------------------------------------
create or replace function public._hangout_for_member(p_event_id uuid, p_host boolean default false)
returns public.hangouts language plpgsql security definer set search_path = '' as $$
declare h public.hangouts;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into h from public.hangouts where event_id = p_event_id for update;
  if not found then raise exception 'This isn''t a hangout'; end if;
  if p_host and not public.is_hangout_host(p_event_id) then raise exception 'Only the host can do that'; end if;
  if not public.is_hangout_member(p_event_id) then raise exception 'Join this hangout first'; end if;
  if h.stage in ('ended', 'cancelled') then raise exception 'This hangout has ended'; end if;
  return h;
end $$;

-- Replaces the caller's free times; blocks are clipped to the date range and merged.
create or replace function public.save_hangout_availability(p_event_id uuid, p_blocks jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  h public.hangouts := public._hangout_for_member(p_event_id);
  v_from timestamptz;
  v_to timestamptz;
  v_count int;
begin
  if h.stage <> 'collecting' then raise exception 'The time is locked, so free times can''t change'; end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 336 then raise exception 'Those free times aren''t valid'; end if;
  v_from := h.date_start::timestamp at time zone 'Asia/Singapore';
  v_to := (h.date_end + 1)::timestamp at time zone 'Asia/Singapore';
  insert into public.hangout_replies (event_id, user_id) values (p_event_id, auth.uid())
  on conflict (event_id, user_id) do update set responded_at = now();
  delete from public.hangout_free_blocks where event_id = p_event_id and user_id = auth.uid();
  insert into public.hangout_free_blocks (event_id, user_id, starts_at, ends_at)
  select p_event_id, auth.uid(), min(s), max(e)
  from (
    select s, e, sum(new_group) over (order by s, e) as grp
    from (
      select s, e, case when s <= max(e) over (order by s, e rows between unbounded preceding and 1 preceding) then 0 else 1 end as new_group
      from (
        select greatest((b ->> 'start')::timestamptz, v_from) as s, least((b ->> 'end')::timestamptz, v_to) as e
        from jsonb_array_elements(p_blocks) b
      ) clipped where e > s
    ) marked
  ) grouped group by grp;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.clear_hangout_availability(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.hangouts := public._hangout_for_member(p_event_id);
begin
  if h.stage <> 'collecting' then raise exception 'The time is locked, so free times can''t change'; end if;
  delete from public.hangout_replies where event_id = p_event_id and user_id = auth.uid();
end $$;

-- Aggregate overlap: per 30-minute cell, how many repliers are free for the whole cell.
create or replace function public.hangout_heatmap(p_event_id uuid)
returns table (cell_start timestamptz, free_count int) language plpgsql stable security definer set search_path = '' as $$
declare h public.hangouts;
begin
  select * into h from public.hangouts where event_id = p_event_id;
  if not found or not public.is_hangout_member(p_event_id) or h.date_start is null then raise exception 'Join this hangout first'; end if;
  return query
    select c.t, (select count(distinct b.user_id)::int from public.hangout_free_blocks b
                 where b.event_id = p_event_id and b.starts_at <= c.t and b.ends_at >= c.t + interval '30 minutes')
    from generate_series(h.date_start::timestamp at time zone 'Asia/Singapore',
                         (h.date_end + 1)::timestamp at time zone 'Asia/Singapore' - interval '30 minutes',
                         interval '30 minutes') as c(t);
end $$;

create or replace function public.set_hangout_required(p_event_id uuid, p_user_id uuid, p_required boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.hangouts := public._hangout_for_member(p_event_id, true);
begin
  if p_user_id = auth.uid() then raise exception 'The host is always required'; end if;
  if not exists (select 1 from public.registrations where event_id = p_event_id and user_id = p_user_id and status = 'confirmed') then
    raise exception 'That person isn''t in this hangout';
  end if;
  insert into public.hangout_member_settings (event_id, user_id, required) values (p_event_id, p_user_id, p_required)
  on conflict (event_id, user_id) do update set required = excluded.required;
end $$;

-- Revalidated in the database: the host and every required member who replied must be
-- free for the whole interval, and required members must have replied.
create or replace function public.lock_hangout_slot(p_event_id uuid, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  h public.hangouts := public._hangout_for_member(p_event_id, true);
  v_host uuid := auth.uid();
  v_blocked text;
begin
  if h.stage <> 'collecting' then raise exception 'A time is already locked'; end if;
  if p_start < h.date_start::timestamp at time zone 'Asia/Singapore' or p_end > (h.date_end + 1)::timestamp at time zone 'Asia/Singapore' then
    raise exception 'The time must fall inside the hangout''s dates';
  end if;
  if p_end - p_start not between interval '1 hour' and interval '12 hours' then raise exception 'Choose between 1 and 12 hours'; end if;
  select string_agg(coalesce(p.display_name, 'A required member'), ', ') into v_blocked
  from (select v_host as user_id union select s.user_id from public.hangout_member_settings s
        join public.registrations r on r.event_id = s.event_id and r.user_id = s.user_id and r.status = 'confirmed'
        where s.event_id = p_event_id and s.required) req
  left join public.profiles p on p.id = req.user_id
  where not exists (select 1 from public.hangout_free_blocks b where b.event_id = p_event_id and b.user_id = req.user_id and b.starts_at <= p_start and b.ends_at >= p_end);
  if v_blocked is not null then raise exception 'Not free (or no reply) for the whole time: %', v_blocked; end if;
  update public.hangouts set locked_start = p_start, locked_end = p_end, stage = 'voting', revision = revision + 1 where event_id = p_event_id;
  update public.events set starts_at = p_start, ends_at = p_end where id = p_event_id;
end $$;

create or replace function public.unlock_hangout_slot(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.hangouts := public._hangout_for_member(p_event_id, true);
begin
  if h.mode <> 'group' or h.locked_start is null then raise exception 'There''s no locked time to release'; end if;
  update public.hangouts set locked_start = null, locked_end = null, stage = 'collecting', plan_finalized_at = null, revision = revision + 1 where event_id = p_event_id;
  update public.events set starts_at = h.date_start::timestamp at time zone 'Asia/Singapore',
    ends_at = (h.date_end + 1)::timestamp at time zone 'Asia/Singapore' - interval '1 minute' where id = p_event_id;
end $$;

-- 6. Plan, votes and confirmation -----------------------------------------------------
create or replace function public.add_hangout_place(p_event_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare h public.hangouts := public._hangout_for_member(p_event_id, true);
declare v_id uuid;
begin
  if h.locked_start is null then raise exception 'Lock a time first'; end if;
  insert into public.hangout_places (event_id, name, address, latitude, longitude, minutes, kind, opens_at, closes_at)
  values (p_event_id, btrim(p ->> 'name'), coalesce(p ->> 'address', ''), (p ->> 'lat')::float8, (p ->> 'lng')::float8,
          (p ->> 'minutes')::int, coalesce(p ->> 'kind', 'activity'), (p #>> '{hours,open}')::time, (p #>> '{hours,close}')::time)
  returning id into v_id;
  return v_id;
end $$;

-- p_stops: [{ "event": uuid } | { "place": uuid }] in order. A stop keeps its id; one
-- whose position changes gets a new version, so earlier votes on it go stale.
-- p_revision must match (optimistic concurrency); a confirmed plan reopens to voting.
create or replace function public.set_hangout_stops(p_event_id uuid, p_stops jsonb, p_revision int, p_method text default 'manual', p_options jsonb default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  h public.hangouts := public._hangout_for_member(p_event_id, true);
  s jsonb;
  i int := 0;
  v_existing public.hangout_stops;
  v_changed boolean := false;
  v_keep uuid[] := '{}';
begin
  if h.locked_start is null then raise exception 'Lock a time first'; end if;
  if h.revision <> p_revision then raise exception 'conflict: the plan changed; refresh and try again'; end if;
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) > 6 then raise exception 'A plan has up to 6 stops'; end if;
  for s in select * from jsonb_array_elements(p_stops) loop
    if s ? 'event' then
      if not exists (select 1 from public.events e where e.id = (s ->> 'event')::uuid and e.kind = 'official' and e.status = 'published') then
        raise exception 'One of those events isn''t available';
      end if;
      select * into v_existing from public.hangout_stops where event_id = p_event_id and ref_event_id = (s ->> 'event')::uuid;
    elsif s ? 'place' then
      if not exists (select 1 from public.hangout_places pl where pl.id = (s ->> 'place')::uuid and pl.event_id = p_event_id) then
        raise exception 'That place isn''t part of this plan';
      end if;
      select * into v_existing from public.hangout_stops where event_id = p_event_id and ref_place_id = (s ->> 'place')::uuid;
    else
      raise exception 'Each stop needs an event or a place';
    end if;
    if v_existing.id = any (v_keep) then raise exception 'A stop can appear only once'; end if;
    if v_existing.id is null then
      insert into public.hangout_stops (event_id, position, ref_event_id, ref_place_id)
      values (p_event_id, i, (s ->> 'event')::uuid, (s ->> 'place')::uuid) returning * into v_existing;
      v_changed := true;
    elsif v_existing.position <> i then
      update public.hangout_stops set position = i, version = version + 1 where id = v_existing.id;
      v_changed := true;
    end if;
    v_keep := v_keep || v_existing.id;
    v_existing := null;
    i := i + 1;
  end loop;
  delete from public.hangout_stops where event_id = p_event_id and not (id = any (v_keep));
  if found then v_changed := true; end if;
  update public.hangouts set
    plan_method = coalesce(p_method, plan_method),
    plan_options = coalesce(p_options, plan_options),
    plan_changed_at = case when v_changed then now() else plan_changed_at end,
    plan_finalized_at = case when v_changed then null else plan_finalized_at end,
    stage = case when v_changed and stage = 'final' then 'voting' else stage end,
    revision = revision + 1
  where event_id = p_event_id;
  return h.revision + 1;
end $$;

create or replace function public.vote_hangout_stop(p_stop_id uuid, p_value int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_stop public.hangout_stops;
  h public.hangouts;
begin
  select * into v_stop from public.hangout_stops where id = p_stop_id;
  if not found then raise exception 'That stop isn''t in the plan any more'; end if;
  h := public._hangout_for_member(v_stop.event_id);
  if h.stage <> 'voting' then raise exception 'Voting is closed right now'; end if;
  if p_value = 0 then
    delete from public.hangout_votes where stop_id = p_stop_id and user_id = auth.uid();
  elsif p_value in (-1, 1) then
    insert into public.hangout_votes (stop_id, user_id, version, value) values (p_stop_id, auth.uid(), v_stop.version, p_value)
    on conflict (stop_id, user_id) do update set version = excluded.version, value = excluded.value, voted_at = now();
  else
    raise exception 'Vote Keep, Swap or clear';
  end if;
end $$;

-- Current-version vote counts per stop (stale votes are ignored).
create or replace function public.hangout_vote_counts(p_event_id uuid)
returns table (stop_id uuid, keep int, swap int, mine int) language sql stable security definer set search_path = '' as $$
  select s.id,
    count(*) filter (where v.value = 1 and v.version = s.version)::int,
    count(*) filter (where v.value = -1 and v.version = s.version)::int,
    coalesce(max(v.value) filter (where v.user_id = auth.uid() and v.version = s.version), 0)::int
  from public.hangout_stops s left join public.hangout_votes v on v.stop_id = s.id
  where s.event_id = p_event_id and public.is_hangout_member(p_event_id)
  group by s.id;
$$;

-- The application runs the full timing check first; the database rechecks what it can.
create or replace function public.finalize_hangout_plan(p_event_id uuid, p_revision int)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.hangouts := public._hangout_for_member(p_event_id, true);
begin
  if h.stage <> 'voting' then raise exception 'The plan can be confirmed only while voting is open'; end if;
  if h.revision <> p_revision then raise exception 'conflict: the plan changed; review it again'; end if;
  if not exists (select 1 from public.hangout_stops where event_id = p_event_id) then raise exception 'Add at least one stop before confirming'; end if;
  if exists (select 1 from public.hangout_stops s where s.event_id = p_event_id and s.ref_event_id is null and s.ref_place_id is null) then
    raise exception 'A stop is no longer available';
  end if;
  if exists (select 1 from public.hangout_stops s join public.events e on e.id = s.ref_event_id
             where s.event_id = p_event_id and (e.status <> 'published' or e.ends_at <= h.locked_start or e.starts_at >= h.locked_end)) then
    raise exception 'An event in the plan is cancelled or outside the hangout time';
  end if;
  update public.hangouts set stage = 'final', plan_finalized_at = now(), plan_ever_final = true, revision = revision + 1 where event_id = p_event_id;
end $$;

create or replace function public.reopen_hangout_plan(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.hangouts := public._hangout_for_member(p_event_id, true);
begin
  if h.stage <> 'final' then raise exception 'The plan isn''t confirmed'; end if;
  update public.hangouts set stage = 'voting', plan_finalized_at = null, plan_changed_at = now(), revision = revision + 1 where event_id = p_event_id;
end $$;

create or replace function public.set_hangout_meeting_point(p_event_id uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.hangouts := public._hangout_for_member(p_event_id, true);
begin
  if char_length(btrim(coalesce(p_text, ''))) > 120 then raise exception 'Keep the meeting point to 120 characters'; end if;
  update public.hangouts set meeting_point = btrim(coalesce(p_text, '')) where event_id = p_event_id;
end $$;

-- 7. Discovery view: add the kind so Discover can label Open Jios -----------------------
create or replace view public.events_with_counts with (security_invoker = on) as
select
  e.id, e.organiser_id, e.title, e.description, e.category,
  e.starts_at, e.ends_at, e.venue_id, e.backup_venue_id, e.using_backup,
  e.capacity, e.requires_approval, e.registration_closes_at, e.status,
  e.published_at, e.search_vector, e.created_at, e.updated_at,
  e.starts_at as start_time,
  coalesce(a.confirmed, 0) as confirmed_count,
  a.spots_left,
  coalesce(t.tags, '{}'::text[]) as tags,
  v.latitude as lat,
  v.longitude as lng,
  e.cover_image_url as image_url,
  e.kind,
  coalesce(e.join_mode::text, case when e.requires_approval then 'approval' else 'auto' end) as join_mode
from public.events e
left join lateral public.event_availability(array[e.id]) a on true
left join lateral (
  select array_agg(i.slug order by i.slug) as tags
  from public.event_interests ei
  join public.interests i on i.id = ei.interest_id
  where ei.event_id = e.id
) t on true
left join public.venues v
  on v.id = case when e.using_backup then e.backup_venue_id else e.venue_id end
where e.status = 'published';

grant select on public.events_with_counts to anon, authenticated;

-- 8. Function grants ----------------------------------------------------------------------
revoke execute on function public._admission_status(public.events, int), public._hangout_for_member(uuid, boolean) from public, anon, authenticated;
grant execute on function public.preview_hangout_invite(text) to anon, authenticated;
grant execute on function public.create_hangout(jsonb), public.join_hangout_by_invite(text), public.save_hangout_availability(uuid, jsonb),
  public.clear_hangout_availability(uuid), public.hangout_heatmap(uuid), public.set_hangout_required(uuid, uuid, boolean),
  public.lock_hangout_slot(uuid, timestamptz, timestamptz), public.unlock_hangout_slot(uuid), public.add_hangout_place(uuid, jsonb),
  public.set_hangout_stops(uuid, jsonb, int, text, jsonb), public.vote_hangout_stop(uuid, int), public.hangout_vote_counts(uuid),
  public.finalize_hangout_plan(uuid, int), public.reopen_hangout_plan(uuid), public.set_hangout_meeting_point(uuid, text),
  public.hangout_invite_token(uuid), public.hangout_members(uuid) to authenticated;
