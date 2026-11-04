-- REVIEW ONLY: coordinate with Timothy and compare hosted migration history first.
-- Prerequisite: profiles.username from profile-username-draft.sql.
-- Invitation-only friend groups; unrelated to event teams and hangout membership.
begin;

create table public.profile_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, request_id)
);
create table public.profile_group_memberships (
  group_id uuid not null references public.profile_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('invited', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index profile_group_memberships_user on public.profile_group_memberships(user_id, status);
alter table public.profile_groups enable row level security;
alter table public.profile_group_memberships enable row level security;
-- RPC-only access. No direct table reads/writes, including from signed-in browsers.
revoke all on public.profile_groups, public.profile_group_memberships from public, anon, authenticated;

create function public.profile_groups_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_groups jsonb; v_invitations jsonb;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'isOwner', g.owner_id = v_uid) order by g.created_at, g.id), '[]'::jsonb)
    into v_groups from public.profile_groups g
    join public.profile_group_memberships m on m.group_id = g.id
    where m.user_id = v_uid and m.status = 'accepted';
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'ownerName', p.display_name, 'ownerUsername', p.username) order by g.created_at, g.id), '[]'::jsonb)
    into v_invitations from public.profile_groups g
    join public.profile_group_memberships m on m.group_id = g.id
    join public.profiles p on p.id = g.owner_id
    where m.user_id = v_uid and m.status = 'invited';
  return jsonb_build_object('groups', v_groups, 'invitations', v_invitations);
end $$;

create function public.profile_group_members(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profile_group_memberships where group_id = p_group_id and user_id = v_uid and status = 'accepted') then
    raise exception 'Join this group before viewing members.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name, 'username', p.username, 'status', m.status, 'isOwner', g.owner_id = p.id) order by (g.owner_id = p.id) desc, m.created_at, p.id), '[]'::jsonb)
    into v_result from public.profile_group_memberships m
    join public.profiles p on p.id = m.user_id
    join public.profile_groups g on g.id = m.group_id
    where m.group_id = p_group_id and m.status in ('accepted', 'invited');
  return v_result;
end $$;

create function public.create_profile_group(p_name text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_name text := btrim(p_name);
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if v_name is null or char_length(v_name) not between 1 and 60 or p_request_id is null then
    raise exception 'Enter a group name of 1–60 characters.' using errcode = '22023';
  end if;
  insert into public.profile_groups(owner_id, name, request_id) values(v_uid, v_name, p_request_id)
    on conflict(owner_id, request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.profile_groups where owner_id = v_uid and request_id = p_request_id;
  end if;
  insert into public.profile_group_memberships(group_id, user_id, status) values(v_id, v_uid, 'accepted') on conflict do nothing;
  return v_id;
end $$;

create function public.search_group_people(p_query text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_query text := lower(btrim(p_query)); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if v_query is null or v_query !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Enter at least 3 letters, numbers or underscores from a username.' using errcode = '22023';
  end if;
  -- starts_with treats underscores literally. Never return postal codes, coordinates,
  -- interests, email addresses or the rest of the profile row.
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name) order by p.username), '[]'::jsonb)
    into v_result from (select id, username, display_name from public.profiles
      where id <> v_uid and username is not null and starts_with(username, v_query)
      order by username limit 20) p;
  return v_result;
end $$;

create function public.invite_profile_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_owner uuid;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select owner_id into v_owner from public.profile_groups where id = p_group_id for update;
  if v_owner is distinct from v_uid then raise exception 'Only the group owner can invite friends.' using errcode = '42501'; end if;
  if p_user_id = v_uid then raise exception 'You are already in this group.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and username is not null) then
    raise exception 'No person found with that username.' using errcode = '22023';
  end if;
  insert into public.profile_group_memberships(group_id, user_id, status) values(p_group_id, p_user_id, 'invited')
    on conflict(group_id, user_id) do update set status = 'invited', updated_at = now()
    where public.profile_group_memberships.status = 'declined';
end $$;

create function public.respond_profile_group_invite(p_group_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_status text; v_owner uuid; v_next text;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_accept is null then raise exception 'Choose Accept or Decline.' using errcode = '22023'; end if;
  -- Same group lock as inviting: invitation/responses serialize, including retries.
  select owner_id into v_owner from public.profile_groups where id = p_group_id for update;
  if v_owner = v_uid then raise exception 'You already own this group.' using errcode = '22023'; end if;
  select status into v_status from public.profile_group_memberships where group_id = p_group_id and user_id = v_uid;
  v_next := case when p_accept then 'accepted' else 'declined' end;
  if v_status = v_next then return; end if;
  if v_status is distinct from 'invited' then raise exception 'No pending invitation was found.' using errcode = '42501'; end if;
  update public.profile_group_memberships set status = v_next, updated_at = now() where group_id = p_group_id and user_id = v_uid;
end $$;

revoke all on function public.profile_groups_overview() from public, anon, authenticated;
revoke all on function public.profile_group_members(uuid) from public, anon, authenticated;
revoke all on function public.create_profile_group(text, uuid) from public, anon, authenticated;
revoke all on function public.search_group_people(text) from public, anon, authenticated;
revoke all on function public.invite_profile_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_profile_group_invite(uuid, boolean) from public, anon, authenticated;
grant execute on function public.profile_groups_overview() to authenticated;
grant execute on function public.profile_group_members(uuid) to authenticated;
grant execute on function public.create_profile_group(text, uuid) to authenticated;
grant execute on function public.search_group_people(text) to authenticated;
grant execute on function public.invite_profile_group_member(uuid, uuid) to authenticated;
grant execute on function public.respond_profile_group_invite(uuid, boolean) to authenticated;
commit;
