-- Feature 1 (Aishani) contract with the schema. Agreed with Huxley on 22 Oct 2026
-- after the signed-in live test; Timothy to review. See docs/merge-session-2026-10-22.md.

-- 1. Profile fields used by the Profile page and the "For you" ranking:
--    postal code + OneMap coordinates (distance score) and adaptive interest weights,
--    keyed by public.interests.slug (the same slugs events are tagged with).
alter table public.profiles
  add column if not exists postal_code text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists interest_weights jsonb not null default '{}'::jsonb;

alter table public.profiles
  add constraint profiles_postal_code_format check (postal_code is null or postal_code ~ '^[0-9]{6}$'),
  add constraint profiles_lat_range check (lat is null or lat between -90 and 90),
  add constraint profiles_lng_range check (lng is null or lng between -180 and 180),
  add constraint profiles_lat_lng_together check ((lat is null) = (lng is null)),
  add constraint profiles_interest_weights_object check (jsonb_typeof(interest_weights) = 'object');

grant update (postal_code, lat, lng, interest_weights) on public.profiles to authenticated;

-- 2. events_with_counts was created by hand on the hosted project (not in any migration)
--    as a SECURITY DEFINER view: it ignored RLS, so anyone could read draft events and
--    counts. Rebuilt as a security_invoker view over published events only. Counts come
--    from event_availability(), which already decides what non-organisers may see.
--    Adds the tags (event_interests -> interests.slug) and the active venue's coordinates
--    that the recommendation engine scores on.
drop view if exists public.events_with_counts;

create view public.events_with_counts with (security_invoker = on) as
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
  v.longitude as lng
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
