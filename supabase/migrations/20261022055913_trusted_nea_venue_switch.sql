-- Trusted, one-way venue switch. Only the authenticated owner-facing Edge Function
-- may call this RPC, after validating fresh NEA data against the original venue.
-- This table is private to the function/RPC and is the idempotency record.
create table public.feature4_venue_switches (
  event_id uuid primary key references public.events (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  announcement_id uuid not null unique references public.announcements (id) on delete cascade,
  forecast_area text not null check (btrim(forecast_area) <> '' and char_length(forecast_area) <= 120),
  forecast_description text not null,
  issued_at timestamptz not null,
  updated_at timestamptz not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  verified_at timestamptz not null,
  switched_at timestamptz not null default now(),
  check (issued_at <= updated_at),
  check (valid_from < valid_until),
  check (valid_until - valid_from <= interval '2 hours')
);
alter table public.feature4_venue_switches enable row level security;
revoke all on public.feature4_venue_switches from public, anon, authenticated;

-- Only the function's transaction-local capability permits the protected event
-- column update. Browser UPDATEs remain blocked, including owner UPDATEs.
create or replace function public.feature4_prevent_untrusted_venue_switch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.using_backup is distinct from old.using_backup
     and current_setting('feature4.trusted_switch', true) is distinct from 'on' then
    raise exception 'Venue switching is allowed only through the trusted NEA verification path';
  end if;
  return new;
end;
$$;
revoke execute on function public.feature4_prevent_untrusted_venue_switch() from public, anon, authenticated;

create or replace function public.commit_trusted_venue_switch(
  p_event_id uuid,
  p_owner_id uuid,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_original public.venues;
  v_backup public.venues;
  v_announcement public.announcements;
  v_switch public.feature4_venue_switches;
  v_area text;
  v_forecast text;
  v_issued timestamptz;
  v_updated timestamptz;
  v_from timestamptz;
  v_until timestamptz;
  v_verified timestamptz;
  v_now timestamptz := clock_timestamp();
  v_event_time timestamptz;
begin
  if p_event_id is null or p_owner_id is null then
    raise exception 'Event and owner are required';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update;
  if not found then raise exception 'Event not found'; end if;
  if v_event.organiser_id is distinct from p_owner_id then
    raise exception 'Only the event owner can switch its venue';
  end if;

  -- Response-loss retries return the exact committed post and current event.
  -- A manually/predecessor-switched event without this record is ambiguous and
  -- cannot be reconciled as success.
  if v_event.using_backup then
    select * into v_switch from public.feature4_venue_switches s where s.event_id = p_event_id;
    if not found then raise exception 'Event is already using its backup venue without a trusted switch record'; end if;
    if v_switch.owner_id is distinct from p_owner_id then raise exception 'Only the event owner can reconcile this venue switch'; end if;
    select * into v_announcement from public.announcements a where a.id = v_switch.announcement_id;
    if not found then raise exception 'Trusted venue switch announcement is missing'; end if;
    select * into v_original from public.venues where id = v_event.venue_id;
    select * into v_backup from public.venues where id = v_event.backup_venue_id;
    return jsonb_build_object(
      'event', jsonb_build_object(
        'id', v_event.id, 'title', v_event.title,
        'startTime', v_event.starts_at, 'endTime', v_event.ends_at,
        'isOutdoor', coalesce(not v_original.is_indoor, false),
        'venue', jsonb_build_object('id', v_backup.id, 'name', v_backup.name, 'address', v_backup.address,
          'postalCode', v_backup.postal_code, 'lat', v_backup.latitude, 'lng', v_backup.longitude, 'isIndoor', v_backup.is_indoor),
        'originalVenue', jsonb_build_object('id', v_original.id, 'name', v_original.name, 'address', v_original.address,
          'postalCode', v_original.postal_code, 'lat', v_original.latitude, 'lng', v_original.longitude, 'isIndoor', v_original.is_indoor),
        'backupVenue', jsonb_build_object('id', v_backup.id, 'name', v_backup.name, 'address', v_backup.address,
          'postalCode', v_backup.postal_code, 'lat', v_backup.latitude, 'lng', v_backup.longitude, 'isIndoor', v_backup.is_indoor),
        'usingBackup', true, 'venueSwitchedAt', v_switch.switched_at, 'venueSwitchAnnouncementId', v_announcement.id
      ),
      'announcement', jsonb_build_object(
        'id', v_announcement.id, 'eventId', v_announcement.event_id, 'body', v_announcement.body,
        'kind', 'venue-switch', 'createdAt', v_announcement.created_at, 'updatedAt', null
      )
    );
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'Fresh trusted NEA forecast evidence is required';
  end if;
  if (select count(*) from jsonb_object_keys(p_evidence)) <> 7
     or not (p_evidence ?& array['area', 'forecast', 'issuedAt', 'updatedAt', 'validFrom', 'validUntil', 'verifiedAt']) then
    raise exception 'Trusted NEA forecast evidence has an invalid shape';
  end if;
  v_area := p_evidence ->> 'area';
  v_forecast := p_evidence ->> 'forecast';
  v_issued := (p_evidence ->> 'issuedAt')::timestamptz;
  v_updated := (p_evidence ->> 'updatedAt')::timestamptz;
  v_from := (p_evidence ->> 'validFrom')::timestamptz;
  v_until := (p_evidence ->> 'validUntil')::timestamptz;
  v_verified := (p_evidence ->> 'verifiedAt')::timestamptz;
  if v_area is null or btrim(v_area) = '' or char_length(v_area) > 120
     or v_forecast is null or btrim(v_forecast) = '' or char_length(v_forecast) > 100 then
    raise exception 'Forecast area and description are required';
  end if;
  if not (v_forecast ~* '^(light|moderate|heavy|passing|thundery|widespread)( (light|moderate|heavy|passing|thundery|widespread))* (rain|showers)( with gusty winds)?$'
       or v_forecast ~* '^(rain|showers)( with gusty winds)?$') then
    raise exception 'The verified forecast must describe rain or showers';
  end if;
  if v_issued is null or v_updated is null or v_from is null or v_until is null or v_verified is null
     or v_issued > v_updated or v_updated > v_verified or v_verified > v_now
     or v_now - v_issued > interval '2 hours' or v_now - v_updated > interval '2 hours'
     or v_verified < v_now - interval '2 minutes'
     or v_from >= v_until or v_until - v_from > interval '2 hours'
     or v_now < v_from or v_now >= v_until then
    raise exception 'The verified NEA forecast is stale or outside its valid period';
  end if;

  select * into v_original from public.venues where id = v_event.venue_id;
  select * into v_backup from public.venues where id = v_event.backup_venue_id;
  if v_original.id is null or v_original.is_indoor is distinct from false
     or v_original.latitude is null or v_original.longitude is null then
    raise exception 'The original venue must be an outdoor venue with valid coordinates';
  end if;
  if v_backup.id is null or btrim(coalesce(v_backup.name, '')) = '' or btrim(coalesce(v_backup.address, '')) = '' then
    raise exception 'A backup venue with a name and address is required';
  end if;
  if v_event.status is distinct from 'published' then raise exception 'Only a published event can switch venues'; end if;
  if v_event.ends_at <= v_now then raise exception 'The event has ended'; end if;
  v_event_time := greatest(v_event.starts_at, v_now);
  if v_event_time < v_from or v_event_time >= v_until then
    raise exception 'The event is outside the current NEA forecast window';
  end if;

  perform set_config('feature4.trusted_switch', 'on', true);
  update public.events set using_backup = true, updated_at = v_now where id = p_event_id returning * into v_event;
  insert into public.announcements (event_id, author_id, title, body, audience, is_automatic)
  values (
    p_event_id, p_owner_id, 'Venue change: ' || v_backup.name,
    'Venue changed from ' || v_original.name || ' to ' || v_backup.name || ', ' || v_backup.address
      || '. Confirmed at ' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      || ' because ' || v_forecast || ' is forecast for ' || v_area || '.',
    'everyone', true
  ) returning * into v_announcement;

  insert into public.feature4_venue_switches (
    event_id, owner_id, announcement_id, forecast_area, forecast_description,
    issued_at, updated_at, valid_from, valid_until, verified_at, switched_at
  ) values (
    p_event_id, p_owner_id, v_announcement.id, v_area, v_forecast,
    v_issued, v_updated, v_from, v_until, v_verified, v_now
  ) returning * into v_switch;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id, 'title', v_event.title,
      'startTime', v_event.starts_at, 'endTime', v_event.ends_at,
      'isOutdoor', true,
      'venue', jsonb_build_object('id', v_backup.id, 'name', v_backup.name, 'address', v_backup.address,
        'postalCode', v_backup.postal_code, 'lat', v_backup.latitude, 'lng', v_backup.longitude, 'isIndoor', v_backup.is_indoor),
      'originalVenue', jsonb_build_object('id', v_original.id, 'name', v_original.name, 'address', v_original.address,
        'postalCode', v_original.postal_code, 'lat', v_original.latitude, 'lng', v_original.longitude, 'isIndoor', v_original.is_indoor),
      'backupVenue', jsonb_build_object('id', v_backup.id, 'name', v_backup.name, 'address', v_backup.address,
        'postalCode', v_backup.postal_code, 'lat', v_backup.latitude, 'lng', v_backup.longitude, 'isIndoor', v_backup.is_indoor),
      'usingBackup', true, 'venueSwitchedAt', v_switch.switched_at, 'venueSwitchAnnouncementId', v_announcement.id
    ),
    'announcement', jsonb_build_object(
      'id', v_announcement.id, 'eventId', v_announcement.event_id, 'body', v_announcement.body,
      'kind', 'venue-switch', 'createdAt', v_announcement.created_at, 'updatedAt', null
    )
  );
end;
$$;
revoke all on function public.commit_trusted_venue_switch(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.commit_trusted_venue_switch(uuid, uuid, jsonb) to service_role;

-- Keep the earlier fail-closed browser RPC unavailable even if its earlier grant
-- was installed before this migration.
revoke all on function public.switch_event_venue(uuid, boolean, text) from public, anon, authenticated;
