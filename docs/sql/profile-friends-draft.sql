-- REVIEW ONLY. Coordinate with Timothy and verify hosted history before applying.
-- Requires profiles.username. Does not require or change groups/event memberships.
begin;
create table public.profile_friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requester_id in (user_low, user_high))
);
create index profile_friendships_high on public.profile_friendships(user_high);
alter table public.profile_friendships enable row level security;
revoke all on public.profile_friendships from public, anon, authenticated;

create function public.profile_friends_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'friends', coalesce(jsonb_agg(person order by username) filter(where status = 'accepted'), '[]'::jsonb),
    'incoming', coalesce(jsonb_agg(person order by username) filter(where status = 'pending' and requester_id <> v_uid), '[]'::jsonb),
    'outgoing', coalesce(jsonb_agg(person order by username) filter(where status = 'pending' and requester_id = v_uid), '[]'::jsonb)
  ) into v_result from (
    select f.status, f.requester_id, p.username,
      jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name) as person
    from public.profile_friendships f join public.profiles p
      on p.id = case when f.user_low = v_uid then f.user_high else f.user_low end
    where v_uid in (f.user_low, f.user_high) and f.status <> 'declined'
  ) people;
  return v_result;
end $$;

create function public.search_profile_friends(p_query text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_query text := lower(btrim(p_query)); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if v_query is null or v_query !~ '^[a-z0-9_]{3,20}$' then raise exception 'Enter at least 3 letters, numbers or underscores from a username.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name,
    'relationship', case when f.status = 'accepted' then 'friends' when f.status = 'pending' and f.requester_id = v_uid then 'outgoing' when f.status = 'pending' then 'incoming' else 'none' end) order by p.username), '[]'::jsonb)
  into v_result from (select id, username, display_name from public.profiles where id <> v_uid and starts_with(username, v_query) order by username limit 20) p
  left join public.profile_friendships f on f.user_low = least(v_uid, p.id) and f.user_high = greatest(v_uid, p.id);
  return v_result;
end $$;

create function public.send_profile_friend_request(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_existing public.profile_friendships;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_user_id is null or p_user_id = v_uid then raise exception 'Choose another account.' using errcode = '22023'; end if;
  if not exists(select 1 from public.profiles where id = p_user_id and username is not null) then raise exception 'Person not found.' using errcode = '22023'; end if;
  -- Pair-scoped lock also serializes simultaneous requests in opposite directions.
  perform pg_advisory_xact_lock(hashtextextended(least(v_uid,p_user_id)::text || greatest(v_uid,p_user_id)::text, 0));
  select * into v_existing from public.profile_friendships where user_low = least(v_uid,p_user_id) and user_high = greatest(v_uid,p_user_id) for update;
  if v_existing.status = 'accepted' then return; end if;
  if v_existing.status = 'pending' then
    if v_existing.requester_id = v_uid then return; end if;
    raise exception 'This person already sent you a request. Accept it under Friend requests.' using errcode = '22023';
  end if;
  insert into public.profile_friendships(user_low,user_high,requester_id,status)
    values(least(v_uid,p_user_id),greatest(v_uid,p_user_id),v_uid,'pending')
    on conflict(user_low,user_high) do update set requester_id=v_uid,status='pending',updated_at=now();
end $$;

create function public.respond_profile_friend_request(p_user_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_existing public.profile_friendships; v_next text;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_user_id is null or p_accept is null or p_user_id = v_uid then raise exception 'Choose a friend request and response.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(v_uid,p_user_id)::text || greatest(v_uid,p_user_id)::text, 0));
  select * into v_existing from public.profile_friendships where user_low = least(v_uid,p_user_id) and user_high = greatest(v_uid,p_user_id) for update;
  if v_existing.requester_id is distinct from p_user_id then raise exception 'No incoming request found.' using errcode = '42501'; end if;
  v_next := case when p_accept then 'accepted' else 'declined' end;
  if v_existing.status = v_next then return; end if;
  if v_existing.status <> 'pending' then raise exception 'No pending request found.' using errcode = '42501'; end if;
  update public.profile_friendships set status=v_next,updated_at=now() where user_low=least(v_uid,p_user_id) and user_high=greatest(v_uid,p_user_id);
end $$;
revoke all on function public.profile_friends_overview() from public, anon, authenticated;
revoke all on function public.search_profile_friends(text) from public, anon, authenticated;
revoke all on function public.send_profile_friend_request(uuid) from public, anon, authenticated;
revoke all on function public.respond_profile_friend_request(uuid,boolean) from public, anon, authenticated;
grant execute on function public.profile_friends_overview() to authenticated;
grant execute on function public.search_profile_friends(text) to authenticated;
grant execute on function public.send_profile_friend_request(uuid) to authenticated;
grant execute on function public.respond_profile_friend_request(uuid,boolean) to authenticated;
commit;
