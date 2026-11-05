-- Physical events whose venue is announced later (5 November 2026, requested by the user).
-- An organiser can publish a physical event with no venue yet ("Venue to be announced") and
-- add it later in Manage event → Edit event, or choose the venue now and keep it hidden until a
-- set time before the start. Before that time nobody but the event's organisers can see the
-- venue; afterwards it is an ordinary venue that everyone sees. The demo backend follows the
-- same rules (client/src/utils/venueReveal.js). Not applied to Bookerz by the agent: the user
-- pushes it.
--
-- Venues are publicly readable, so a hidden venue is not put in public.venues until its time:
-- it waits in the organisers-only event_hidden_venues table, and release_due_event_venues()
-- (every minute, and callable by the app at the reveal time) turns it into venue rows.
-- Existing events keep their venues: the new column is null for every row.

-- 1. When a hidden venue appears ------------------------------------------------------------
-- Public, so the event page can say "Venue revealed on …". Set only through
-- event_hidden_venues (see the guard below): non-null exactly while a hidden venue waits.
alter table public.events add column venue_reveal_at timestamptz;
alter table public.events add constraint events_hidden_venue_not_public
  check (venue_reveal_at is null
         or (not is_online and venue_id is null and backup_venue_id is null and not using_backup));
grant select (venue_reveal_at) on public.events to anon, authenticated;

-- 2. The hidden venue itself ----------------------------------------------------------------
-- venue / backup_venue use the create_event_with_details shape:
-- { name, address, postal, lat, lng }. A backup venue means an outdoor event, as elsewhere.
create table public.event_hidden_venues (
  event_id      uuid primary key references public.events (id) on delete cascade,
  venue         jsonb not null,
  backup_venue  jsonb,
  reveal_at     timestamptz not null,
  updated_at    timestamptz not null default now()
);
alter table public.event_hidden_venues enable row level security;
revoke all on public.event_hidden_venues from public, anon, authenticated;
grant select, insert, update, delete on public.event_hidden_venues to authenticated;

-- The same people who can edit the event (the owner has an organiser membership row)
create policy "Event organisers manage the hidden venue" on public.event_hidden_venues
  for all to authenticated
  using (public.is_event_organiser(event_id))
  with check (public.is_event_organiser(event_id));

create or replace function public._venue_json_ok(p_venue jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(p_venue) = 'object'
    and (select count(*) from jsonb_object_keys(p_venue)) = 5
    and p_venue ?& array['name', 'address', 'postal', 'lat', 'lng']
    and jsonb_typeof(p_venue -> 'name') = 'string'
    and btrim(p_venue ->> 'name') <> '' and char_length(p_venue ->> 'name') <= 300
    and jsonb_typeof(p_venue -> 'address') = 'string'
    and btrim(p_venue ->> 'address') <> '' and char_length(p_venue ->> 'address') <= 500
    and jsonb_typeof(p_venue -> 'postal') in ('string', 'null')
    and jsonb_typeof(p_venue -> 'lat') = 'number'
    and jsonb_typeof(p_venue -> 'lng') = 'number', false)
$$;
revoke all on function public._venue_json_ok(jsonb) from public, anon, authenticated, service_role;

-- A hidden venue belongs to an official physical event that hasn't switched to its backup, and
-- appears in the future, no later than the start.
create or replace function public.event_hidden_venues_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
begin
  if tg_op = 'UPDATE' and new.event_id <> old.event_id then
    raise exception 'A hidden venue stays with its event.';
  end if;
  select * into e from public.events where id = new.event_id;
  if not found or e.kind <> 'official' then
    raise exception 'Only events can keep a venue hidden.';
  end if;
  if e.is_online then
    raise exception 'Online events have no venue to hide.';
  end if;
  if e.using_backup then
    raise exception 'This event has switched to its backup venue, so its venues can no longer be changed.';
  end if;
  if not public._venue_json_ok(new.venue) then
    raise exception 'The selected venue needs a name, address, latitude, and longitude.';
  end if;
  if new.backup_venue is not null and new.backup_venue <> 'null'::jsonb
     and not public._venue_json_ok(new.backup_venue) then
    raise exception 'The backup venue needs a name, address, and valid coordinates.';
  end if;
  if new.backup_venue = 'null'::jsonb then new.backup_venue := null; end if;
  if new.reveal_at <= now() then
    raise exception 'Choose a time in the future to reveal the venue, or show it now.';
  end if;
  if new.reveal_at > e.starts_at then
    raise exception 'The venue has to be revealed before the event starts.';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.event_hidden_venues_check() from public, anon, authenticated, service_role;
create trigger event_hidden_venues_check
  before insert or update on public.event_hidden_venues
  for each row execute function public.event_hidden_venues_check();

-- Keeps events.venue_reveal_at in step: hiding a venue takes the public one off the event
create or replace function public.event_hidden_venues_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.events set venue_reveal_at = null
    where id = old.event_id and venue_reveal_at is not null;
    return null;
  end if;
  update public.events
  set venue_id = null, backup_venue_id = null, venue_reveal_at = new.reveal_at
  where id = new.event_id;
  return null;
end $$;
revoke all on function public.event_hidden_venues_sync() from public, anon, authenticated, service_role;
create trigger event_hidden_venues_sync
  after insert or update or delete on public.event_hidden_venues
  for each row execute function public.event_hidden_venues_sync();

-- Only the sync trigger above sets venue_reveal_at: a direct insert or update can't, so the
-- public time always matches a hidden venue that really exists.
create or replace function public.events_venue_reveal_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() < 2 and (
       (tg_op = 'INSERT' and new.venue_reveal_at is not null)
       or (tg_op = 'UPDATE' and new.venue_reveal_at is distinct from old.venue_reveal_at)) then
    raise exception 'The venue reveal time is set by saving the hidden venue.';
  end if;
  return new;
end $$;
revoke all on function public.events_venue_reveal_guard() from public, anon, authenticated, service_role;
create trigger events_venue_reveal_guard
  before insert or update of venue_reveal_at on public.events
  for each row execute function public.events_venue_reveal_guard();

-- 3. Releasing hidden venues when their time comes ------------------------------------------
-- Turns each due hidden venue into ordinary venue rows on its event. Safe to call any time and
-- from anywhere: it only releases venues whose time has passed. Returns how many it released.
create or replace function public.release_due_event_venues()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  h public.event_hidden_venues;
  v_owner uuid;
  v_main uuid;
  v_backup uuid;
  v_count integer := 0;
begin
  for h in
    delete from public.event_hidden_venues where reveal_at <= now() returning *
  loop
    select organiser_id into v_owner from public.events where id = h.event_id;
    insert into public.venues (name, address, postal_code, latitude, longitude, is_indoor, created_by)
    values (btrim(h.venue ->> 'name'), btrim(h.venue ->> 'address'), nullif(btrim(h.venue ->> 'postal'), ''),
            (h.venue ->> 'lat')::double precision, (h.venue ->> 'lng')::double precision,
            h.backup_venue is null, v_owner)
    returning id into v_main;
    v_backup := null;
    if h.backup_venue is not null then
      insert into public.venues (name, address, postal_code, latitude, longitude, is_indoor, created_by)
      values (btrim(h.backup_venue ->> 'name'), btrim(h.backup_venue ->> 'address'),
              nullif(btrim(h.backup_venue ->> 'postal'), ''),
              (h.backup_venue ->> 'lat')::double precision, (h.backup_venue ->> 'lng')::double precision,
              true, v_owner)
      returning id into v_backup;
    end if;
    update public.events set venue_id = v_main, backup_venue_id = v_backup where id = h.event_id;
    -- Like venues made by create_event_with_details, these are cleaned up with the event
    insert into public.event_created_venues (venue_id, original_event_id) values (v_main, h.event_id);
    if v_backup is not null then
      insert into public.event_created_venues (venue_id, original_event_id) values (v_backup, h.event_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.release_due_event_venues() from public, anon, authenticated, service_role;
grant execute on function public.release_due_event_venues() to anon, authenticated;

select cron.schedule('release-hidden-venues', '* * * * *', 'select public.release_due_event_venues()');

-- 4. Event creation: the 5 November RPC, with the venue optional and venueRevealAt -----------
-- A physical event may have no venue (and then no rain plan). venueRevealAt (optional, string
-- or null) keeps a chosen venue hidden until then; a time that has already passed shows it now.
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
  v_venue_reveal timestamptz;
  v_hide_venue boolean := false;
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
         'coverImageUrl', 'hideCapacity', 'isOnline', 'onlineLink', 'venueRevealAt')
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

  if jsonb_typeof(coalesce(p_event -> 'venueRevealAt', 'null'::jsonb)) not in ('string', 'null') then
    raise exception 'The venue reveal time must be a date and time.';
  end if;
  if coalesce(p_event -> 'venueRevealAt', 'null'::jsonb) <> 'null'::jsonb then
    if v_is_online then
      raise exception 'Online events have no venue to hide.';
    end if;
    if v_venue = 'null'::jsonb then
      raise exception 'Choose the venue to keep hidden, or leave it to be announced.';
    end if;
    v_venue_reveal := (p_event ->> 'venueRevealAt')::timestamptz;
    if v_venue_reveal > v_start then
      raise exception 'The venue has to be revealed before the event starts.';
    end if;
    -- A reveal time that has already passed simply shows the venue now
    v_hide_venue := v_venue_reveal > clock_timestamp();
  end if;

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
  elsif v_venue = 'null'::jsonb then
    -- Physical, venue to be announced: the rain plan is chosen with the venue
    if v_link <> 'null'::jsonb then
      raise exception 'Only online events can have an online link.';
    end if;
    if v_is_outdoor or v_backup <> 'null'::jsonb then
      raise exception 'Choose the venue before adding a rain plan.';
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

  -- A hidden venue waits in event_hidden_venues instead of the public venues table
  if not v_is_online and v_venue <> 'null'::jsonb and not v_hide_venue then
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

  if v_hide_venue then
    insert into public.event_hidden_venues (event_id, venue, backup_venue, reveal_at)
    values (v_event_id,
            jsonb_build_object('name', btrim(v_venue ->> 'name'), 'address', btrim(v_venue ->> 'address'),
                               'postal', v_venue -> 'postal', 'lat', v_venue -> 'lat', 'lng', v_venue -> 'lng'),
            case when v_backup = 'null'::jsonb then null else
              jsonb_build_object('name', btrim(v_backup ->> 'name'), 'address', btrim(v_backup ->> 'address'),
                                 'postal', v_backup -> 'postal', 'lat', v_backup -> 'lat', 'lng', v_backup -> 'lng') end,
            v_venue_reveal);
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

-- 5. Go together groups meet at the venue, so a hidden venue makes them wait -----------------
-- The hosted definition from 20261105074842_event_group_members.sql, plus the hidden-venue
-- check. Events with no venue at all keep allowing groups, as they always have.
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
  if t.is_online then raise exception 'Go together groups are for in-person events, so online events can’t have one.'; end if;
  if t.venue_reveal_at is not null then raise exception 'Go together groups meet at the venue, so they can start once it’s revealed.'; end if;
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
  insert into public.group_invites (group_id, user_id, invited_by)
  select distinct v_id, f.id, auth.uid() from unnest(coalesce(p_invite_ids, '{}')) as f(id)
  where f.id <> auth.uid() and public.are_friends(auth.uid(), f.id)
  on conflict do nothing;
  return v_id;
end $$;
revoke execute on function public.create_group(uuid, text, int, text, text, uuid[]) from public, anon;
grant execute on function public.create_group(uuid, text, int, text, text, uuid[]) to authenticated;

-- 6. Discovery view: the 5 November view plus venue_reveal_at -------------------------------
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
  e.hide_capacity,
  e.venue_reveal_at
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
