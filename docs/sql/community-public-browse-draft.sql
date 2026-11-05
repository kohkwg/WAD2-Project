-- REVIEW ONLY: compare hosted migration history with Timothy before applying.
-- Updates the existing Community functions. No new tables or RPC names.
-- Requires Go together and friends invitations migrations. Guest results omit private data.
begin;
create or replace function public._group_summary(p_group_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is not null then payload else
    jsonb_build_object(
      'id',payload->'id','eventId',payload->'eventId','note',payload->'note',
      'capacity',payload->'capacity','spotsLeft',payload->'spotsLeft',
      'joinMode',payload->'joinMode','visibility',payload->'visibility',
      'createdAt',payload->'createdAt','startTime',payload->'startTime','endTime',payload->'endTime',
      'host',jsonb_build_object('id','host-' || (payload->>'id'),'name',payload->'host'->>'name'),
      'members',coalesce((select jsonb_agg(jsonb_build_object('id','member-' || (payload->>'id') || '-' || n,'name','Group member'))
        from generate_series(1,jsonb_array_length(payload->'members')) n),'[]'::jsonb),
      'myStatus',null,'myRsvpId',null,'myEventStatus',null,'pendingCount',0,'commentCount',0
    ) end
  from (
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
    'commentCount', (select count(*) from public.group_messages m where m.group_id = e.id),
    'hostIsFriend', e.organiser_id <> auth.uid() and public.are_friends(e.organiser_id, auth.uid()),
    'myInvite', (
      select jsonb_build_object('id', i.group_id, 'from', jsonb_build_object('id', i.invited_by, 'name', coalesce(nullif(ip.display_name, ''), 'A friend')))
      from public.group_invites i left join public.profiles ip on ip.id = i.invited_by
      where i.group_id = e.id and i.user_id = auth.uid() and i.status = 'pending'),
    'requests', case when e.organiser_id = auth.uid() then coalesce((
      select jsonb_agg(jsonb_build_object('rsvpId', r.id, 'userId', r.user_id, 'name', coalesce(nullif(p.display_name, ''), 'Someone'),
                                          'message', coalesce(n.body, ''), 'createdAt', r.created_at) order by r.created_at)
      from public.registrations r
      left join public.profiles p on p.id = r.user_id
      left join public.group_join_notes n on n.group_id = e.id and n.user_id = r.user_id
      where r.event_id = e.id and r.status = 'pending'), '[]'::jsonb) else '[]'::jsonb end
  ) as payload
  from public.groups g
  join public.events e on e.id = g.event_id
  left join public.profiles hp on hp.id = e.organiser_id
  where g.event_id = p_group_id
  ) summary
  where auth.uid() is not null or (
    payload->>'visibility'='public' and exists (
      select 1 from public.events e join public.events official on official.id=(payload->>'eventId')::uuid
      where e.id=(payload->>'id')::uuid and e.status='published'
        and official.status='published' and official.kind::text='official'
    )
  );
$$;

create or replace function public.group_list()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(payload order by starts_at,id),'[]'::jsonb) from (
    select e.id,e.starts_at,public._group_summary(e.id) as payload
    from public.groups g join public.events e on e.id=g.event_id
    where e.status='published' and e.ends_at>now()
      and (case when auth.uid() is null then g.visibility='public'
           else public._group_can_view(g.event_id,null) end)
  ) groups where payload is not null;
$$;

create or replace function public.group_view(p_group_id uuid default null, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    if p_token is not null or not exists (
      select 1 from public.groups g join public.events e on e.id=g.event_id
      join public.events official on official.id=g.official_event_id
      where g.event_id=p_group_id and g.visibility='public' and e.status='published'
        and official.status='published' and official.kind::text='official'
    ) then raise exception 'This group is unavailable or requires sign in.' using errcode='42501'; end if;
    return public._group_summary(p_group_id);
  end if;
  if p_token is not null then
    select g.event_id into v_id from public.groups g join public.events e on e.id = g.event_id
    where g.invite_token = p_token and e.status = 'published';
    if v_id is null then raise exception 'This invite link isn’t valid any more. Ask the host for a new one.'; end if;
  else
    select g.event_id into v_id from public.groups g join public.events e on e.id = g.event_id
    where g.event_id = p_group_id and e.status = 'published';
    if v_id is null then raise exception 'This group isn’t available any more.'; end if;
  end if;
  if not public._group_can_view(v_id, p_token) then raise exception 'This group is for the host’s friends. Ask them for the invite link.'; end if;
  return public._group_summary(v_id) || jsonb_build_object('viaInvite', p_token is not null);
end $$;

revoke all on function public._group_summary(uuid) from public, anon, authenticated;
revoke all on function public.group_list(), public.group_view(uuid,text) from public;
grant execute on function public.group_list(), public.group_view(uuid,text) to anon, authenticated;
-- Remove the earlier optional preview functions if that draft was already applied.
drop function if exists public.public_group_list();
drop function if exists public.public_group_view(uuid);
drop function if exists public._public_group_preview(uuid);
commit;
