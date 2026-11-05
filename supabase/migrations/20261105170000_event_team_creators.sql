-- Creator identity (username, display name, chosen dino avatar) for the events an organiser runs.
-- Used by the Organise page's event cards. Without this function the app falls back to initials.
-- Only returns rows for events the caller organises (is_event_organiser), and nothing for signed-out
-- callers. Needs profiles.username, which already exists on the hosted project.
-- profiles.username was added to the hosted project by hand; a fresh database needs it before
-- this function, which is checked when it is created. A no-op on the hosted project.
alter table public.profiles add column if not exists username text;

create or replace function public.event_team_creators(p_event_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', e.id, 'username', p.username, 'displayName', p.display_name,
    'dino', case when jsonb_typeof(u.raw_user_meta_data->'dino') = 'string'
      then u.raw_user_meta_data->>'dino' else null end
  )), '[]'::jsonb)
  from public.events e join public.profiles p on p.id=e.organiser_id
  left join auth.users u on u.id=e.organiser_id
  where auth.uid() is not null and e.id=any(p_event_ids) and public.is_event_organiser(e.id);
$$;
revoke all on function public.event_team_creators(uuid[]) from public, anon, authenticated;
grant execute on function public.event_team_creators(uuid[]) to authenticated;
