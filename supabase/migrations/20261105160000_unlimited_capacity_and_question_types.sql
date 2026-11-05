-- 1. No limit on spots. events.capacity has always been nullable (null = unlimited) and the
-- availability, waitlist and promotion logic already treat null that way; only create_event_with_details
-- insisted on a positive whole number. A JSON null or a missing capacity now means unlimited.
-- 2. More RSVP question types. The question_type enum already has short_text, long_text, yes_no,
-- number, single_choice and multi_choice; the function only took 'text' and 'yesno'. It now takes
-- text, longtext, yesno, number, choice and multichoice, and the choice types carry an `options`
-- array (2 to 10 non-blank strings of up to 80 characters).
-- Everything else is unchanged from 20261105150000_venue_to_be_announced.sql.
-- Not yet applied to the hosted project: check the hosted history first.

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
  -- A JSON null (or no key) means no limit; otherwise a positive whole number
  if coalesce(jsonb_typeof(p_event -> 'capacity'), 'null') <> 'null'
     and (jsonb_typeof(p_event -> 'capacity') is distinct from 'number'
          or (p_event ->> 'capacity') !~ '^[1-9][0-9]*$') then
    raise exception 'Capacity must be a positive whole number, or left empty for no limit.';
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
    where (select count(*) from jsonb_object_keys(q.value)) <> (case when q.value ? 'options' then 4 else 3 end)
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
       or q.value ->> 'type' not in ('text', 'longtext', 'yesno', 'number', 'choice', 'multichoice')
  ) then
    raise exception 'RSVP questions need text, a supported type, and a required flag.';
  end if;
  -- Options belong to the choice types only: 2 to 10 non-blank strings of up to 80 characters
  if exists (
    select 1 from jsonb_array_elements(p_event -> 'questions') q(value)
    where (q.value ->> 'type' in ('choice', 'multichoice') and (
             jsonb_typeof(q.value -> 'options') is distinct from 'array'
             or jsonb_array_length(q.value -> 'options') not between 2 and 10
             or exists (
               select 1 from jsonb_array_elements(q.value -> 'options') o(value)
               where jsonb_typeof(o.value) is distinct from 'string'
                  or btrim(o.value #>> '{}') = '' or char_length(o.value #>> '{}') > 80)))
       or (q.value ->> 'type' not in ('choice', 'multichoice') and q.value ? 'options')
  ) then
    raise exception 'Pick-one and pick-several questions need 2 to 10 options; other questions take none.';
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

  insert into public.event_questions (event_id, prompt, type, options, required, position)
  select v_event_id, btrim(q.value ->> 'text'),
         case q.value ->> 'type' when 'yesno' then 'yes_no'::public.question_type
                                 when 'longtext' then 'long_text'::public.question_type
                                 when 'number' then 'number'::public.question_type
                                 when 'choice' then 'single_choice'::public.question_type
                                 when 'multichoice' then 'multi_choice'::public.question_type
                                 else 'short_text'::public.question_type end,
         case when q.value ->> 'type' in ('choice', 'multichoice') then q.value -> 'options' else '[]'::jsonb end,
         (q.value ->> 'required')::boolean, (q.ordinality - 1)::integer
  from jsonb_array_elements(p_event -> 'questions') with ordinality q(value, ordinality);

  insert into public.event_creation_requests (owner_id, request_id, request_payload, event_id)
  values (v_owner, p_request_id, p_event, v_event_id);

  return v_event_id;
end;
$$;

revoke all on function public.create_event_with_details(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_event_with_details(uuid, jsonb) to authenticated;
