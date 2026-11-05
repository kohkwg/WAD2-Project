-- REVIEW ONLY: coordinate with Timothy and verify hosted history before applying.
-- Requires the Go together migration. Does not grant public access to existing private RPCs/tables.
begin;
create or replace function public._public_group_preview(p_group_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id', e.id, 'eventId', g.official_event_id, 'note', e.description,
    'capacity', e.capacity, 'visibility', 'public', 'joinMode', e.join_mode::text,
    'startTime', e.starts_at, 'endTime', e.ends_at, 'createdAt', e.created_at,
    'host', jsonb_build_object('id', 'host-' || e.id::text, 'name', coalesce(nullif(p.display_name,''),'Host')),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', 'member-' || e.id::text || '-' || n, 'name', 'Group member'))
      from generate_series(1, (select count(*)::int from public.registrations r where r.event_id=e.id and r.status='confirmed')) n), '[]'::jsonb),
    'spotsLeft', greatest(e.capacity - 1 - (select count(*) from public.registrations r where r.event_id=e.id and r.status in ('confirmed','offered')),0),
    'myStatus', null, 'myRsvpId', null, 'myEventStatus', null, 'pendingCount', 0, 'commentCount', 0
  ) from public.groups g join public.events e on e.id=g.event_id
  join public.events official on official.id=g.official_event_id
  left join public.profiles p on p.id=e.organiser_id
  where g.event_id=p_group_id and g.visibility='public' and e.status='published'
    and official.status='published' and official.kind::text='official';
$$;
create or replace function public.public_group_list()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(preview order by starts_at,id),'[]'::jsonb) from (
    select e.id,e.starts_at,public._public_group_preview(e.id) as preview
    from public.groups g join public.events e on e.id=g.event_id
    where g.visibility='public' and e.status='published' and e.ends_at>now()
  ) rows where preview is not null;
$$;
create or replace function public.public_group_view(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result := public._public_group_preview(p_group_id);
  if result is null then raise exception 'This group is unavailable or requires sign in.' using errcode='42501'; end if;
  return result;
end $$;
revoke all on function public._public_group_preview(uuid), public.public_group_list(), public.public_group_view(uuid) from public, anon, authenticated;
grant execute on function public.public_group_list(), public.public_group_view(uuid) to anon, authenticated;
commit;
