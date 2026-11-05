-- Go together indicator for organisers (5 November 2026): on an event's RSVP list, show who is
-- coming with a group. Read-only; only the event's own team (organiser or helpers) can call it.
-- Friends-only groups don't reveal their host's name. Mirrors getEventGroupMembers in mockApi.js.
--
-- Also reconciles create_group: 20261105050527 (friends, invites, RSVP rule) and
-- 20261105120000 (no groups for online events) both redefined it, and on the hosted project the
-- online check was lost. This keeps one create_group with every rule; 20261105120000 now defines
-- the same, so a fresh database ends up identical. Applied to the hosted project 5 November 2026.

drop function if exists public.create_group(uuid, text, int, text, text);
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

-- Who is coming with a group, for the event's team
create or replace function public.event_group_members(p_event_id uuid)
returns table (user_id uuid, group_id uuid, host_name text, group_size int, is_host boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_event_organiser(p_event_id) or public.is_event_staff(p_event_id)) then
    raise exception 'Only the event''s team can see who is coming with a group.';
  end if;
  return query
    with people as (
      select g.event_id as gid, g.visibility, e.organiser_id as host, e.organiser_id as uid, true as hosting
      from public.groups g join public.events e on e.id = g.event_id
      where g.official_event_id = p_event_id and e.status = 'published'
      union all
      select g.event_id, g.visibility, e.organiser_id, r.user_id, false
      from public.groups g
      join public.events e on e.id = g.event_id
      join public.registrations r on r.event_id = g.event_id and r.status = 'confirmed'
      where g.official_event_id = p_event_id and e.status = 'published'
    )
    select pp.uid, pp.gid,
      case when pp.visibility = 'public' then coalesce(nullif(p.display_name, ''), 'Someone') end,
      (count(*) over (partition by pp.gid))::int, pp.hosting
    from people pp left join public.profiles p on p.id = pp.host;
end $$;
revoke execute on function public.event_group_members(uuid) from public, anon;
grant execute on function public.event_group_members(uuid) to authenticated;
