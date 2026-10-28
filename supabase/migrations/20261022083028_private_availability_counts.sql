-- Keep the public availability response useful while hiding organiser-only RSVP
-- states and all non-published event counts from unrelated callers.
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
              else greatest(e.capacity - count(r.id) filter
                   (where r.status in ('confirmed', 'offered')), 0)::int
         end
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.id = any (p_event_ids)
    and (e.status = 'published' or public.is_event_organiser(e.id))
  group by e.id;
$$;
