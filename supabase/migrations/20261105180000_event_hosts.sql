-- Who hosts an event: its organiser and any co-organisers, for the "Hosted by" card on the event page.
-- profiles is readable only by signed-in users (and holds postcode and location), so the page asks
-- this function instead. It returns public profile fields only (name, username, bio, avatar and the
-- chosen dino, read the same way as event_team_creators) and
-- answers for exactly the events the asker could already see (same rule as the events select policy).
-- Helpers are not listed: they work on the event but don't host it.

-- The hosted project added profiles.username outside the migrations; a fresh database needs it too.
-- (A no-op on the hosted project.)
alter table public.profiles add column if not exists username text;

create or replace function public.event_hosts(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select e.organiser_id into v_owner
  from public.events e
  where e.id = p_event_id
    and (public.event_publicly_listed(e.id)
         or e.organiser_id = auth.uid()
         or public.is_event_staff(e.id)
         or public.is_group_member(e.id));
  if v_owner is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', coalesce(nullif(btrim(p.display_name), ''), 'Organiser'),
             'username', p.username,
             'bio', nullif(btrim(p.bio), ''),
             'avatarKey', p.avatar_key,
             'dino', case when jsonb_typeof(u.raw_user_meta_data -> 'dino') = 'string'
                          then u.raw_user_meta_data ->> 'dino' else null end,
             'role', case when p.id = v_owner then 'organiser' else 'co-organiser' end)
           order by (p.id = v_owner) desc, h.added_at nulls first, p.display_name)
    from (
      select v_owner as user_id, null::timestamptz as added_at
      union
      select m.user_id, min(m.added_at)
      from public.event_members m
      where m.event_id = p_event_id and m.member_role = 'organiser' and m.user_id <> v_owner
      group by m.user_id
    ) h
    join public.profiles p on p.id = h.user_id
    left join auth.users u on u.id = h.user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.event_hosts(uuid) from public, anon, authenticated, service_role;
grant execute on function public.event_hosts(uuid) to anon, authenticated;
