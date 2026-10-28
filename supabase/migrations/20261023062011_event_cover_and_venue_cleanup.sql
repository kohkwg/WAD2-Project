-- Applied to Bookerz with explicit user approval on 23 October 2026.
-- Future RPC-created venues only. Existing catalogue/orphan rows are untouched.
-- Hosted migration version retained from the Supabase migration tool.
alter table public.events add column cover_image_url text;
alter table public.events add constraint events_cover_image_url_https check (
  cover_image_url is null or (char_length(cover_image_url) <= 2048
    and cover_image_url ~ '^https://[^/[:space:]?#@]+/[^[:space:]<>]*$')
);
grant select (cover_image_url) on public.events to anon, authenticated;

-- No event FK: provenance must survive deletion until the AFTER DELETE cleanup.
create table public.event_created_venues (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  original_event_id uuid not null
);
alter table public.event_created_venues enable row level security;
revoke all on public.event_created_venues from public, anon, authenticated, service_role;

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
  v_is_outdoor boolean;
  v_title text;
  v_description text;
  v_start timestamptz;
  v_end timestamptz;
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
  if (select count(*) from jsonb_object_keys(p_event)) <> 11 + (case when p_event ? 'coverImageUrl' then 1 else 0 end)
     or not (p_event ?& array[
       'title', 'description', 'startTime', 'endTime', 'capacity',
       'requiresApproval', 'isOutdoor', 'venue', 'backupVenue', 'tags', 'questions'
     ]) then
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
     or jsonb_typeof(p_event -> 'isOutdoor') is distinct from 'boolean' then
    raise exception 'Event approval and venue type must be boolean values.';
  end if;
  v_title := btrim(p_event ->> 'title');
  v_description := btrim(p_event ->> 'description');
  v_requires_approval := (p_event ->> 'requiresApproval')::boolean;
  v_is_outdoor := (p_event ->> 'isOutdoor')::boolean;
  v_venue := p_event -> 'venue';
  v_backup := p_event -> 'backupVenue';

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

  insert into public.events (
    organiser_id, title, description, starts_at, ends_at, capacity,
    requires_approval, venue_id, backup_venue_id, status, cover_image_url
  ) values (
    v_owner, v_title, v_description, v_start, v_end, v_capacity,
    v_requires_approval, v_venue_id, v_backup_venue_id, 'published', p_event ->> 'coverImageUrl'
  ) returning id into v_event_id;

  -- Only these newly inserted rows are eligible for automatic cleanup.
  insert into public.event_created_venues (venue_id, original_event_id)
  values (v_venue_id, v_event_id);
  if v_backup_venue_id is not null then
    insert into public.event_created_venues (venue_id, original_event_id)
    values (v_backup_venue_id, v_event_id);
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

-- Preserve any marked venue reused by another event, floor plan or weather option.
create or replace function public.cleanup_event_created_venues()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize concurrent FK attachments before the next statement checks references.
  perform 1 from public.venues v
  join public.event_created_venues p on p.venue_id = v.id
  where p.original_event_id = old.id or v.id in (old.venue_id, old.backup_venue_id)
  order by v.id for update of v;
  delete from public.venues v
  using public.event_created_venues p
  where p.venue_id = v.id
    and (p.original_event_id = old.id or v.id in (old.venue_id, old.backup_venue_id))
    and not exists (select 1 from public.events e where e.venue_id = v.id or e.backup_venue_id = v.id)
    and not exists (select 1 from public.floor_plans f where f.venue_id = v.id)
    and not exists (select 1 from public.weather_checks w where w.suggested_venue_id = v.id);
  return old;
end;
$$;
revoke all on function public.cleanup_event_created_venues() from public, anon, authenticated, service_role;
create trigger cleanup_event_created_venues_after_delete
  after delete on public.events for each row execute function public.cleanup_event_created_venues();

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
  e.cover_image_url as image_url
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
