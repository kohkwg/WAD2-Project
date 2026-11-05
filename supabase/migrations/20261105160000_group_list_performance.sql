-- Go together performance (5 November 2026). The site timed out because the group functions were
-- plain SQL functions: Postgres re-plans those on every call, and _group_summary ran once per group
-- (planning ~250 ms against ~20 ms of work) for every Community load, invite list and group page.
-- These versions are PL/pgSQL, whose plans are cached, and build all summaries in one query.
-- Results are the same as before (same JSON fields and the same visibility rules).

-- 1. Small helpers as PL/pgSQL (cached plans) ------------------------------------------------
create or replace function public.is_group_host(p_event_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.events e where e.id = p_event_id and e.kind::text = 'group' and e.organiser_id = auth.uid());
end $$;

create or replace function public.is_group_member(p_event_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  return exists (select 1 from public.events e where e.id = p_event_id and e.kind::text = 'group' and e.organiser_id = v_uid)
      or exists (select 1 from public.events e join public.registrations r on r.event_id = e.id
                 where e.id = p_event_id and e.kind::text = 'group' and r.user_id = v_uid and r.status = 'confirmed');
end $$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_a is null or p_b is null then return false; end if;
  return exists (select 1 from public.profile_friendships f
                 where f.user_low = least(p_a, p_b) and f.user_high = greatest(p_a, p_b) and f.status = 'accepted');
end $$;

create or replace function public._group_can_view(p_group_id uuid, p_token text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  return exists (
    select 1 from public.groups g join public.events e on e.id = g.event_id
    where g.event_id = p_group_id and e.status = 'published'
      and (g.visibility = 'public' or (p_token is not null and g.invite_token = p_token)
           or e.organiser_id = v_uid
           or exists (select 1 from public.registrations r where r.event_id = p_group_id and r.user_id = v_uid
                      and r.status in ('pending', 'confirmed', 'waitlisted', 'offered'))
           or exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.user_id = v_uid and i.status = 'pending')
           or exists (select 1 from public.profile_friendships f where f.user_low = least(e.organiser_id, v_uid)
                      and f.user_high = greatest(e.organiser_id, v_uid) and f.status = 'accepted'))
  );
end $$;

-- 2. Every summary in one query ----------------------------------------------------------------
create or replace function public._group_summaries(p_ids uuid[])
returns table (group_id uuid, starts_at timestamptz, summary jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  return query
  with gs as (
    select g.event_id, g.official_event_id, g.visibility, g.invite_token, e.organiser_id, e.description, e.capacity,
           e.join_mode, e.requires_approval, e.created_at, e.starts_at, e.ends_at
    from public.groups g join public.events e on e.id = g.event_id
    where g.event_id = any (p_ids)
  ),
  regs as (
    select r.id, r.event_id, r.user_id, r.status, r.created_at from public.registrations r where r.event_id = any (p_ids)
  ),
  mine as (
    select r.event_id, r.id, r.status from regs r
    where r.user_id = v_uid and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')
  ),
  my_official as (
    select r.event_id, r.status from public.registrations r
    where r.user_id = v_uid and r.event_id in (select gs.official_event_id from gs)
      and r.status in ('pending', 'confirmed', 'waitlisted', 'offered')
  ),
  members as (
    select r.event_id, jsonb_agg(jsonb_build_object('id', r.user_id, 'name', coalesce(nullif(p.display_name, ''), 'Member'))
                                 order by r.created_at) as list
    from regs r left join public.profiles p on p.id = r.user_id
    where r.status = 'confirmed' group by r.event_id
  ),
  held as (select r.event_id, count(*) as n from regs r where r.status in ('confirmed', 'offered') group by r.event_id),
  pend as (select r.event_id, count(*) as n from regs r where r.status = 'pending' group by r.event_id),
  reqs as (
    select r.event_id, jsonb_agg(jsonb_build_object('rsvpId', r.id, 'userId', r.user_id, 'name', coalesce(nullif(p.display_name, ''), 'Someone'),
                                                    'message', coalesce(n.body, ''), 'createdAt', r.created_at) order by r.created_at) as list
    from regs r
    left join public.profiles p on p.id = r.user_id
    left join public.group_join_notes n on n.group_id = r.event_id and n.user_id = r.user_id
    where r.status = 'pending' group by r.event_id
  ),
  msgs as (select m.group_id, count(*) as n from public.group_messages m where m.group_id = any (p_ids) group by m.group_id),
  inv as (
    select i.group_id, i.invited_by, coalesce(nullif(p.display_name, ''), 'A friend') as nm
    from public.group_invites i left join public.profiles p on p.id = i.invited_by
    where i.group_id = any (p_ids) and i.user_id = v_uid and i.status = 'pending'
  ),
  friends as (
    select case when f.user_low = v_uid then f.user_high else f.user_low end as other
    from public.profile_friendships f where v_uid in (f.user_low, f.user_high) and f.status = 'accepted'
  )
  select gs.event_id, gs.starts_at, jsonb_build_object(
    'id', gs.event_id,
    'eventId', gs.official_event_id,
    'note', gs.description,
    'capacity', gs.capacity,
    'spotsLeft', case when gs.capacity is null then null else greatest(gs.capacity - 1 - coalesce(held.n, 0), 0) end,
    'joinMode', coalesce(gs.join_mode::text, case when gs.requires_approval then 'approval' else 'auto' end),
    'visibility', gs.visibility,
    'inviteToken', case when gs.organiser_id = v_uid or mine.status = 'confirmed' then gs.invite_token end,
    'createdAt', gs.created_at,
    'startTime', gs.starts_at,
    'endTime', gs.ends_at,
    'host', jsonb_build_object('id', gs.organiser_id, 'name', coalesce(nullif(hp.display_name, ''), 'Host')),
    'members', coalesce(members.list, '[]'::jsonb),
    'pendingCount', coalesce(pend.n, 0),
    'myStatus', case when gs.organiser_id = v_uid then 'host' else mine.status::text end,
    'myRsvpId', mine.id,
    'myEventStatus', mo.status::text,
    'commentCount', coalesce(msgs.n, 0),
    'hostIsFriend', coalesce(gs.organiser_id <> v_uid and exists (select 1 from friends where friends.other = gs.organiser_id), false),
    'myInvite', case when inv.group_id is not null
                     then jsonb_build_object('id', inv.group_id, 'from', jsonb_build_object('id', inv.invited_by, 'name', inv.nm)) end,
    'requests', case when gs.organiser_id = v_uid then coalesce(reqs.list, '[]'::jsonb) else '[]'::jsonb end
  )
  from gs
  left join public.profiles hp on hp.id = gs.organiser_id
  left join mine on mine.event_id = gs.event_id
  left join my_official mo on mo.event_id = gs.official_event_id
  left join members on members.event_id = gs.event_id
  left join held on held.event_id = gs.event_id
  left join pend on pend.event_id = gs.event_id
  left join reqs on reqs.event_id = gs.event_id
  left join msgs on msgs.group_id = gs.event_id
  left join inv on inv.group_id = gs.event_id;
end $$;

create or replace function public._group_summary(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return (select s.summary from public._group_summaries(array[p_group_id]) s);
end $$;

-- 3. The lists the app calls ---------------------------------------------------------------------
create or replace function public.group_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  select coalesce(array_agg(g.event_id), '{}') into v_ids
  from public.groups g join public.events e on e.id = g.event_id
  where e.status = 'published' and e.ends_at > now()
    and (g.visibility = 'public' or e.organiser_id = v_uid
         or exists (select 1 from public.registrations r where r.event_id = g.event_id and r.user_id = v_uid
                    and r.status in ('pending', 'confirmed', 'waitlisted', 'offered'))
         or exists (select 1 from public.group_invites i where i.group_id = g.event_id and i.user_id = v_uid and i.status = 'pending')
         or exists (select 1 from public.profile_friendships f where f.user_low = least(e.organiser_id, v_uid)
                    and f.user_high = greatest(e.organiser_id, v_uid) and f.status = 'accepted'));
  return coalesce((select jsonb_agg(s.summary order by s.starts_at) from public._group_summaries(v_ids) s), '[]'::jsonb);
end $$;

create or replace function public.group_invites_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  select coalesce(array_agg(i.group_id), '{}') into v_ids
  from public.group_invites i join public.events e on e.id = i.group_id
  where i.user_id = v_uid and i.status = 'pending' and e.status = 'published' and e.ends_at > now();
  if cardinality(v_ids) = 0 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.group_id,
      'from', jsonb_build_object('id', i.invited_by, 'name', coalesce(nullif(p.display_name, ''), 'A friend')),
      'createdAt', i.created_at,
      'group', s.summary) order by i.created_at desc)
    from public.group_invites i
    join public._group_summaries(v_ids) s on s.group_id = i.group_id
    left join public.profiles p on p.id = i.invited_by
    where i.user_id = v_uid and i.status = 'pending'), '[]'::jsonb);
end $$;

create or replace function public.group_notices_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'hostName', n.host_name, 'eventTitle', n.event_title, 'deletedAt', n.deleted_at)
      order by n.deleted_at desc)
    from public.group_notices n where n.user_id = auth.uid() and not n.seen), '[]'::jsonb);
end $$;

-- 4. Grants (create or replace keeps existing grants; the new helper is internal) ---------------
revoke execute on function public._group_summaries(uuid[]) from public, anon, authenticated;
