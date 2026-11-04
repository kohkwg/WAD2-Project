-- REVIEW ONLY: coordinate with Timothy and verify hosted history before applying.
-- Requires the username, Groups and Friends setup already installed.
-- Private per-account revision signals; request/membership rows stay RPC-only.
begin;
create table public.profile_social_updates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.profile_social_updates enable row level security;
revoke all on public.profile_social_updates from public, anon, authenticated;
grant select on public.profile_social_updates to authenticated;
create policy "Read own social update signal" on public.profile_social_updates
  for select to authenticated using (user_id = (select auth.uid()));

create function public.touch_profile_social_users(p_users uuid[])
returns void language sql security definer set search_path = '' as $$
  insert into public.profile_social_updates(user_id)
    select distinct p.id from unnest(p_users) u(id) join public.profiles p on p.id = u.id order by p.id
    on conflict(user_id) do update set revision = public.profile_social_updates.revision + 1, updated_at = now();
$$;
create function public.signal_profile_friend_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.touch_profile_social_users(array[old.user_low, old.user_high]);
  else
    perform public.touch_profile_social_users(array[new.user_low, new.user_high]);
  end if;
  return null;
end $$;
create trigger profile_friend_change_signal after insert or update or delete on public.profile_friendships
  for each row execute function public.signal_profile_friend_change();

create function public.signal_profile_group_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_user uuid; v_users uuid[];
begin
  if tg_op = 'DELETE' then v_group := old.group_id; v_user := old.user_id;
  else v_group := new.group_id; v_user := new.user_id; end if;
  select array_agg(user_id) into v_users from public.profile_group_memberships
    where group_id = v_group and status in ('accepted','invited');
  perform public.touch_profile_social_users(coalesce(v_users, '{}'::uuid[]) || array[v_user]);
  return null;
end $$;
create trigger profile_group_change_signal after insert or update or delete on public.profile_group_memberships
  for each row execute function public.signal_profile_group_change();

-- Name/username changes also refresh the relevant existing social lists.
create function public.signal_profile_identity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_users uuid[];
begin
  if old.display_name is not distinct from new.display_name and old.username is not distinct from new.username then return null; end if;
  select array_agg(id) into v_users from (
    select new.id as id
    union select case when f.user_low = new.id then f.user_high else f.user_low end from public.profile_friendships f
      where new.id in (f.user_low,f.user_high) and f.status in ('pending','accepted')
    union select m.user_id from public.profile_group_memberships own
      join public.profile_group_memberships m on m.group_id = own.group_id
      where own.user_id = new.id and own.status in ('invited','accepted') and m.status in ('invited','accepted')
  ) peers;
  perform public.touch_profile_social_users(v_users);
  return null;
end $$;
create trigger profile_identity_change_signal after update of display_name, username on public.profiles
  for each row execute function public.signal_profile_identity_change();

revoke all on function public.touch_profile_social_users(uuid[]) from public, anon, authenticated;
revoke all on function public.signal_profile_friend_change() from public, anon, authenticated;
revoke all on function public.signal_profile_group_change() from public, anon, authenticated;
revoke all on function public.signal_profile_identity_change() from public, anon, authenticated;
insert into public.profile_social_updates(user_id) select id from public.profiles;
-- Only publish the safe signal, not private friend/group tables.
alter publication supabase_realtime add table public.profile_social_updates;
commit;
