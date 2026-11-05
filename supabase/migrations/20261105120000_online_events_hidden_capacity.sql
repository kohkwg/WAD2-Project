-- Create Event options (5 November 2026, requested by the user): an "Others" tag, hiding an
-- event's capacity from participants, and online events with a private link that confirmed
-- attendees can open from a chosen date and time. The demo backend follows the same rules
-- (client/src/utils/onlineEvents.js). Applied to Bookerz with the user's approval; see status.md.
--
-- Every existing event becomes physical with its capacity shown (the column defaults), so all
-- rows keep one consistent shape. Nothing else in existing rows changes.

-- 1. "Others" tag -----------------------------------------------------------------------------
insert into public.interests (slug, name) values ('others', 'Others')
on conflict (slug) do nothing;

-- 2. Event columns ----------------------------------------------------------------------------
alter table public.events
  add column is_online boolean not null default false,
  add column hide_capacity boolean not null default false;
-- Online events have no venue, rain plan or backup switch, and only official events can be online.
alter table public.events add constraint events_online_has_no_venue
  check (not is_online or (venue_id is null and backup_venue_id is null and not using_backup));
alter table public.events add constraint events_online_official_only
  check (not is_online or kind = 'official');
grant select (is_online, hide_capacity) on public.events to anon, authenticated;

-- 3. Private online links ---------------------------------------------------------------------
-- Kept out of public.events so people who can read an event never see its link. Only the
-- event's own organiser reads or writes it directly; everyone else goes through
-- event_online_access below.
create table public.event_online_links (
  event_id    uuid primary key references public.events (id) on delete cascade,
  url         text not null check (char_length(url) <= 2048
                and url ~ '^https://[^/[:space:]?#@]+([/?#][^[:space:]<>]*)?$'),
  reveal_at   timestamptz not null,
  updated_at  timestamptz not null default now()
);
alter table public.event_online_links enable row level security;
revoke all on public.event_online_links from public, anon, authenticated;
grant select, insert, update, delete on public.event_online_links to authenticated;

create policy "Organisers manage their online event's link" on public.event_online_links
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));

-- A link belongs to an online event and appears before that event ends.
create or replace function public.event_online_links_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
begin
  select * into e from public.events where id = new.event_id;
  if not found or not e.is_online then
    raise exception 'Only online events can have an online link.';
  end if;
  if new.reveal_at > e.ends_at then
    raise exception 'The online link has to appear before the event ends.';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.event_online_links_check() from public, anon, authenticated, service_role;
create trigger event_online_links_check
  before insert or update on public.event_online_links
  for each row execute function public.event_online_links_check();

-- An event that stops being online keeps no link.
create or replace function public.events_after_online_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.event_online_links where event_id = new.id;
  return null;
end $$;
revoke all on function public.events_after_online_change() from public, anon, authenticated, service_role;
create trigger events_after_online_change
  after update of is_online on public.events
  for each row when (old.is_online and not new.is_online)
  execute function public.events_after_online_change();

-- Whether an online event has a link, when it appears, and the link itself for the organiser,
-- or for a confirmed attendee once reveal_at has passed. Null for physical or unseen events.
create or replace function public.event_online_access(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events;
  l public.event_online_links;
  v_me uuid := auth.uid();
  v_owner boolean;
  v_open boolean;
begin
  select * into e from public.events where id = p_event_id;
  if not found or not e.is_online then return null; end if;
  v_owner := v_me is not null and e.organiser_id = v_me;
  if not (v_owner or public.can_view_event(p_event_id)) then return null; end if;
  select * into l from public.event_online_links where event_id = p_event_id;
  if not found then
    return jsonb_build_object('hasLink', false, 'revealAt', null, 'url', null);
  end if;
  v_open := v_owner or (l.reveal_at <= now() and exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id and r.user_id = v_me and r.status = 'confirmed'
  ));
  return jsonb_build_object('hasLink', true, 'revealAt', l.reveal_at,
                            'url', case when v_open then l.url end);
end $$;
revoke all on function public.event_online_access(uuid) from public, anon, authenticated, service_role;
grant execute on function public.event_online_access(uuid) to anon, authenticated;

-- 4. Event creation: the 23 October RPC plus hideCapacity, isOnline and onlineLink -------------
-- The three new keys are optional, so a payload without them still creates a physical event
-- with its capacity shown. Unknown keys are refused, as before.
create or replace function public.create_event_with_details(
  p_request_id uuid,
  p_event jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_existing public.event_creation_requests;
  v_payload_tags text[];
  v_known_tag_count int;
  v_venue jsonb;
  v_backup jsonb;
  v_link jsonb;
  v_is_outdoor boolean;
  v_is_online boolean;
  v_hide_capacity boolean;
  v_title text;
  v_description text;
  v_start timestamptz;
  v_end timestamptz;
  v_reveal timestamptz;
  v_capacity int;
  v_requires_approval boolean;
  v_venue_id uuid;
  v_backup_venue_id uuid;
  v_event_id uuid;
begin
  if v_owner is null then
    raise exception 'Please sign in first.';
  end if;
  if p_request_id is null then
    raise exception 'A request ID is required to publish this event.';
  end if;
  if p_event is null or jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'Event details must be an object.';
  end if;
  if not (p_event ?& array[
       'title', 'description', 'startTime', 'endTime', 'capacity',
       'requiresApproval', 'isOutdoor', 'venue', 'backupVenue', 'tags', 'questions'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_event) k(key)
       where k.key not in ('title', 'description', 'startTime', 'endTime', 'capacity',
         'requiresApproval', 'isOutdoor', 'venue', 'backupVenue', 'tags', 'questions',
         'coverImageUrl', 'hideCapacity', 'isOnline', 'onlineLink')
     ) then
    raise exception 'Event details have an invalid shape.';
  end if;

  if p_event ? 'coverImageUrl' and (
    jsonb_typeof(p_event -> 'coverImageUrl') is distinct from 'string'
    or char_length(p_event ->> 'coverImageUrl') > 2048
    or (p_event ->> 'coverImageUrl') !~ '^https://[^/[:space:]?#@]+/[^[:space:]<>]*$'
  ) then
    raise exception 'Cover image must be an HTTPS image URL.';
  end if;

  -- The same key and payload serialize concurrent retries. JSONB equality ignores
  -- object-key order but keeps array order, which matters for tags/questions.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_request_id::text, 0));
  select * into v_existing
  from public.event_creation_requests r
  where r.owner_id = v_owner and r.request_id = p_request_id;
  if found then
    if v_existing.request_payload is distinct from p_event then
      raise exception 'This event request ID was already used with different event details.';
    end if;
    if v_existing.event_id is null then
      raise exception 'The event created by this request was deleted; start a new event request.';
    end if;
    return v_existing.event_id;
  end if;

  if jsonb_typeof(p_event -> 'title') is distinct from 'string'
     or btrim(coalesce(p_event ->> 'title', '')) = ''
     or char_length(p_event ->> 'title') > 200 then
    raise exception 'A title of at most 200 characters is required.';
  end if;
  if jsonb_typeof(p_event -> 'description') is distinct from 'string' then
    raise exception 'Event description must be text.';
  end if;
  if jsonb_typeof(p_event -> 'startTime') is distinct from 'string'
     or jsonb_typeof(p_event -> 'endTime') is distinct from 'string' then
    raise exception 'Event start and end times are required.';
  end if;
  v_start := (p_event ->> 'startTime')::timestamptz;
  v_end := (p_event ->> 'endTime')::timestamptz;
  if v_end <= v_start then
    raise exception 'The event end time must be after its start time.';
  end if;
  if v_start <= clock_timestamp() then
    raise exception 'The event start time must be in the future.';
  end if;
  if jsonb_typeof(p_event -> 'capacity') is distinct from 'number'
     or (p_event ->> 'capacity') !~ '^[1-9][0-9]*$' then
    raise exception 'Capacity must be a positive whole number.';
  end if;
  v_capacity := (p_event ->> 'capacity')::integer;
  if jsonb_typeof(p_event -> 'requiresApproval') is distinct from 'boolean'
     or jsonb_typeof(p_event -> 'isOutdoor') is distinct from 'boolean'
     or jsonb_typeof(coalesce(p_event -> 'isOnline', 'false'::jsonb)) is distinct from 'boolean'
     or jsonb_typeof(coalesce(p_event -> 'hideCapacity', 'false'::jsonb)) is distinct from 'boolean' then
    raise exception 'Event approval, venue type, online and capacity display must be boolean values.';
  end if;
  v_title := btrim(p_event ->> 'title');
  v_description := btrim(p_event ->> 'description');
  v_requires_approval := (p_event ->> 'requiresApproval')::boolean;
  v_is_outdoor := (p_event ->> 'isOutdoor')::boolean;
  v_is_online := coalesce((p_event ->> 'isOnline')::boolean, false);
  v_hide_capacity := coalesce((p_event ->> 'hideCapacity')::boolean, false);
  v_venue := p_event -> 'venue';
  v_backup := p_event -> 'backupVenue';
  v_link := coalesce(p_event -> 'onlineLink', 'null'::jsonb);

  if v_is_online then
    -- Online: no venue, no rain plan; an optional link that appears before the event ends
    if v_venue <> 'null'::jsonb or v_backup <> 'null'::jsonb or v_is_outdoor then
      raise exception 'Online events have no venue, backup venue or outdoor setting.';
    end if;
    if v_link <> 'null'::jsonb then
      if jsonb_typeof(v_link) is distinct from 'object'
         or (select count(*) from jsonb_object_keys(v_link)) <> 2
         or not (v_link ?& array['url', 'revealAt'])
         or jsonb_typeof(v_link -> 'url') is distinct from 'string'
         or jsonb_typeof(v_link -> 'revealAt') is distinct from 'string' then
        raise exception 'The online link needs a URL and a time to appear.';
      end if;
      if char_length(v_link ->> 'url') > 2048
         or (v_link ->> 'url') !~ '^https://[^/[:space:]?#@]+([/?#][^[:space:]<>]*)?$' then
        raise exception 'The online link must be a full https:// address.';
      end if;
      v_reveal := (v_link ->> 'revealAt')::timestamptz;
      if v_reveal > v_end then
        raise exception 'The online link has to appear before the event ends.';
      end if;
    end if;
  else
    if v_link <> 'null'::jsonb then
      raise exception 'Only online events can have an online link.';
    end if;
    if jsonb_typeof(v_venue) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_venue)) <> 5
       or not (v_venue ?& array['name', 'address', 'postal', 'lat', 'lng']) then
      raise exception 'A selected venue with coordinates is required.';
    end if;
    if jsonb_typeof(v_venue -> 'name') is distinct from 'string'
       or btrim(coalesce(v_venue ->> 'name', '')) = ''
       or jsonb_typeof(v_venue -> 'address') is distinct from 'string'
       or btrim(coalesce(v_venue ->> 'address', '')) = ''
       or jsonb_typeof(v_venue -> 'lat') is distinct from 'number'
       or jsonb_typeof(v_venue -> 'lng') is distinct from 'number' then
      raise exception 'The selected venue needs a name, address, latitude, and longitude.';
    end if;
    if jsonb_typeof(v_venue -> 'postal') not in ('string', 'null') then
      raise exception 'Venue postal code must be text or null.';
    end if;

    if v_backup = 'null'::jsonb then
      if v_is_outdoor then
        raise exception 'Outdoor events need a backup venue.';
      end if;
    else
      if not v_is_outdoor then
        raise exception 'Indoor events cannot have a backup venue.';
      end if;
      if jsonb_typeof(v_backup) is distinct from 'object'
         or (select count(*) from jsonb_object_keys(v_backup)) <> 5
         or not (v_backup ?& array['name', 'address', 'postal', 'lat', 'lng']) then
        raise exception 'The backup venue is invalid.';
      end if;
      if jsonb_typeof(v_backup -> 'name') is distinct from 'string'
         or btrim(coalesce(v_backup ->> 'name', '')) = ''
         or jsonb_typeof(v_backup -> 'address') is distinct from 'string'
         or btrim(coalesce(v_backup ->> 'address', '')) = ''
         or jsonb_typeof(v_backup -> 'lat') is distinct from 'number'
         or jsonb_typeof(v_backup -> 'lng') is distinct from 'number'
         or jsonb_typeof(v_backup -> 'postal') not in ('string', 'null') then
        raise exception 'The backup venue needs a name, address, and valid coordinates.';
      end if;
    end if;
  end if;

  if jsonb_typeof(p_event -> 'tags') is distinct from 'array'
     or jsonb_typeof(p_event -> 'questions') is distinct from 'array' then
    raise exception 'Event tags and questions must be arrays.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_event -> 'tags') t(value)
    where jsonb_typeof(t.value) is distinct from 'string' or btrim(t.value #>> '{}') = ''
  ) then
    raise exception 'Event tags must be nonblank interest slugs.';
  end if;
  select coalesce(array_agg(t.value #>> '{}' order by t.ordinality), array[]::text[])
    into v_payload_tags
  from jsonb_array_elements(p_event -> 'tags') with ordinality t(value, ordinality);
  if cardinality(v_payload_tags) = 0 then
    raise exception 'Choose at least one event tag.';
  end if;
  if cardinality(v_payload_tags) <> (
    select count(distinct tag.value) from unnest(v_payload_tags) as tag(value)
  ) then
    raise exception 'Event tags cannot be repeated.';
  end if;
  select count(*) into v_known_tag_count
  from public.interests i where i.slug = any(v_payload_tags);
  if v_known_tag_count <> cardinality(v_payload_tags) then
    raise exception 'One or more event tags are not available.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_event -> 'questions') q(value)
    where jsonb_typeof(q.value) is distinct from 'object'
  ) then
    raise exception 'RSVP questions must be objects.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_event -> 'questions') q(value)
    where (select count(*) from jsonb_object_keys(q.value)) <> 3
       or not (q.value ?& array['text', 'type', 'required'])
  ) then
    raise exception 'RSVP questions have an invalid shape.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_event -> 'questions') q(value)
    where jsonb_typeof(q.value -> 'text') is distinct from 'string'
       or btrim(coalesce(q.value ->> 'text', '')) = ''
       or jsonb_typeof(q.value -> 'type') is distinct from 'string'
       or jsonb_typeof(q.value -> 'required') is distinct from 'boolean'
       or q.value ->> 'type' not in ('text', 'yesno')
  ) then
    raise exception 'RSVP questions need text, a supported type, and a required flag.';
  end if;

  if not v_is_online then
    insert into public.venues (name, address, postal_code, latitude, longitude, is_indoor, created_by)
    values (
      btrim(v_venue ->> 'name'), btrim(v_venue ->> 'address'), nullif(btrim(v_venue ->> 'postal'), ''),
      (v_venue ->> 'lat')::double precision, (v_venue ->> 'lng')::double precision,
      not v_is_outdoor, v_owner
    ) returning id into v_venue_id;

    if v_backup <> 'null'::jsonb then
      insert into public.venues (name, address, postal_code, latitude, longitude, is_indoor, created_by)
      values (
        btrim(v_backup ->> 'name'), btrim(v_backup ->> 'address'), nullif(btrim(v_backup ->> 'postal'), ''),
        (v_backup ->> 'lat')::double precision, (v_backup ->> 'lng')::double precision,
        true, v_owner
      ) returning id into v_backup_venue_id;
    end if;
  end if;

  insert into public.events (
    organiser_id, title, description, starts_at, ends_at, capacity,
    requires_approval, venue_id, backup_venue_id, status, cover_image_url,
    is_online, hide_capacity
  ) values (
    v_owner, v_title, v_description, v_start, v_end, v_capacity,
    v_requires_approval, v_venue_id, v_backup_venue_id, 'published', p_event ->> 'coverImageUrl',
    v_is_online, v_hide_capacity
  ) returning id into v_event_id;

  -- Only these newly inserted rows are eligible for automatic cleanup.
  if v_venue_id is not null then
    insert into public.event_created_venues (venue_id, original_event_id)
    values (v_venue_id, v_event_id);
  end if;
  if v_backup_venue_id is not null then
    insert into public.event_created_venues (venue_id, original_event_id)
    values (v_backup_venue_id, v_event_id);
  end if;

  if v_is_online and v_link <> 'null'::jsonb then
    insert into public.event_online_links (event_id, url, reveal_at)
    values (v_event_id, v_link ->> 'url', v_reveal);
  end if;

  insert into public.event_interests (event_id, interest_id)
  select v_event_id, i.id from public.interests i where i.slug = any(v_payload_tags);

  insert into public.event_questions (event_id, prompt, type, required, position)
  select v_event_id, btrim(q.value ->> 'text'),
         case q.value ->> 'type' when 'yesno' then 'yes_no'::public.question_type
                                 else 'short_text'::public.question_type end,
         (q.value ->> 'required')::boolean, (q.ordinality - 1)::integer
  from jsonb_array_elements(p_event -> 'questions') with ordinality q(value, ordinality);

  insert into public.event_creation_requests (owner_id, request_id, request_payload, event_id)
  values (v_owner, p_request_id, p_event, v_event_id);

  return v_event_id;
end;
$$;

revoke all on function public.create_event_with_details(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_event_with_details(uuid, jsonb) to authenticated;

-- 5. Go together groups meet at the event's venue, so online events can't have one ------------
-- The 4 November function, plus the online check.
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
  if t.is_online then raise exception 'Go together groups are for in-person events, so online events can’t have one.'; end if;
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

-- 6. Discovery view: the 3 November view plus is_online and hide_capacity ---------------------
-- For a hidden capacity, people other than the organiser get no capacity, and spots_left is
-- 0 when the event is full and null otherwise, so Discover can still say "Full".
create or replace view public.events_with_counts with (security_invoker = on) as
select
  e.id, e.organiser_id, e.title, e.description, e.category,
  e.starts_at, e.ends_at, e.venue_id, e.backup_venue_id, e.using_backup,
  case when e.hide_capacity and e.organiser_id is distinct from (select auth.uid()) then null else e.capacity end as capacity,
  e.requires_approval, e.registration_closes_at, e.status,
  e.published_at, e.search_vector, e.created_at, e.updated_at,
  e.starts_at as start_time,
  coalesce(a.confirmed, 0) as confirmed_count,
  case when e.hide_capacity and e.organiser_id is distinct from (select auth.uid())
       then case when a.spots_left <= 0 then 0 end
       else a.spots_left end as spots_left,
  coalesce(t.tags, '{}'::text[]) as tags,
  v.latitude as lat,
  v.longitude as lng,
  e.cover_image_url as image_url,
  e.kind,
  coalesce(e.join_mode::text, case when e.requires_approval then 'approval' else 'auto' end) as join_mode,
  e.is_online,
  e.hide_capacity
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
