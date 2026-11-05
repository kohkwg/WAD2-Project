-- REVIEW ONLY. Coordinate with Timothy and verify hosted history before applying.
-- Requires profiles.username. Reuses existing event_members roles/permissions.
begin;
create table public.event_team_invitations (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  member_role public.member_role not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(event_id,user_id)
);
create index event_team_invitations_user on public.event_team_invitations(user_id,status);
alter table public.event_team_invitations enable row level security;
revoke all on public.event_team_invitations from public,anon,authenticated;

create function public.event_team_workspace(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_members jsonb; v_pending jsonb;
begin
  select organiser_id into v_owner from public.events where id=p_event_id;
  if v_uid is null or (v_owner is distinct from v_uid and not public.is_event_staff(p_event_id)) then raise exception 'Only this event team can view its members.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'role',m.member_role,'isOwner',p.id=v_owner) order by (p.id=v_owner) desc,m.added_at,p.id),'[]'::jsonb) into v_members
    from public.event_members m join public.profiles p on p.id=m.user_id where m.event_id=p_event_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'role',i.member_role) order by i.created_at,p.id),'[]'::jsonb) into v_pending
    from public.event_team_invitations i join public.profiles p on p.id=i.user_id where i.event_id=p_event_id and i.status='pending' and v_owner=v_uid
    and not exists(select 1 from public.event_members m where m.event_id=i.event_id and m.user_id=i.user_id);
  return jsonb_build_object('members',v_members,'pending',v_pending,'isOwner',v_owner=v_uid);
end $$;

create function public.search_event_team_people(p_event_id uuid,p_query text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_query text:=lower(btrim(p_query)); v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.events where id=p_event_id and organiser_id=v_uid) then raise exception 'Only the event owner can invite people.' using errcode='42501'; end if;
  if v_query is null or v_query !~ '^[a-z0-9_]{3,20}$' then raise exception 'Enter at least 3 letters, numbers or underscores from a username.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'username',p.username) order by p.username),'[]'::jsonb) into v_result
    from (select id,display_name,username from public.profiles where id<>v_uid and starts_with(username,v_query) order by username limit 20) p;
  return v_result;
end $$;

create function public.invite_event_team_member(p_event_id uuid,p_user_id uuid,p_role public.member_role)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_event public.events; v_old public.event_team_invitations;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into v_event from public.events where id=p_event_id for update;
  if v_event.organiser_id is distinct from v_uid then raise exception 'Only the event owner can invite people.' using errcode='42501'; end if;
  if v_event.status in ('cancelled','completed') or v_event.ends_at<=now() then raise exception 'This event is no longer accepting team invitations.' using errcode='22023'; end if;
  if p_role is null or p_user_id is null or p_user_id=v_uid then raise exception 'Choose another account and a team role.' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and username is not null) then raise exception 'No account found with that username.' using errcode='22023'; end if;
  if exists(select 1 from public.event_members where event_id=p_event_id and user_id=p_user_id) then return; end if;
  select * into v_old from public.event_team_invitations where event_id=p_event_id and user_id=p_user_id;
  if v_old.status='pending' then
    if v_old.member_role<>p_role then raise exception 'An invitation with another role is already pending.' using errcode='22023'; end if;
    return;
  end if;
  insert into public.event_team_invitations(event_id,user_id,invited_by,member_role,status) values(p_event_id,p_user_id,v_uid,p_role,'pending')
    on conflict(event_id,user_id) do update set invited_by=v_uid,member_role=p_role,status='pending',updated_at=now();
end $$;

create function public.my_event_teams()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_incoming jsonb; v_teams jsonb;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'title',e.title,'role',i.member_role,'ownerName',p.display_name,'ownerUsername',p.username) order by i.created_at,e.id),'[]'::jsonb) into v_incoming
    from public.event_team_invitations i join public.events e on e.id=i.event_id join public.profiles p on p.id=e.organiser_id
    where i.user_id=v_uid and i.status='pending' and i.invited_by=e.organiser_id and e.status not in ('cancelled','completed') and e.ends_at>now()
      and not exists(select 1 from public.event_members m where m.event_id=e.id and m.user_id=v_uid);
  select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'title',e.title,'role',m.member_role) order by e.starts_at,e.id),'[]'::jsonb) into v_teams
    from public.event_members m join public.events e on e.id=m.event_id where m.user_id=v_uid and e.organiser_id<>v_uid and e.status not in ('cancelled','completed') and e.ends_at>now();
  return jsonb_build_object('invitations',v_incoming,'teams',v_teams);
end $$;

create function public.respond_event_team_invitation(p_event_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_event public.events; v_invite public.event_team_invitations; v_next text;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_accept is null then raise exception 'Choose Accept or Decline.' using errcode='22023'; end if;
  select * into v_event from public.events where id=p_event_id for update;
  select * into v_invite from public.event_team_invitations where event_id=p_event_id and user_id=v_uid for update;
  if v_invite.user_id is null or v_invite.invited_by is distinct from v_event.organiser_id then raise exception 'No invitation found for your account.' using errcode='42501'; end if;
  v_next:=case when p_accept then 'accepted' else 'declined' end;
  if v_invite.status=v_next then return; end if;
  if v_invite.status<>'pending' then raise exception 'This invitation is no longer pending.' using errcode='22023'; end if;
  if p_accept then
    if v_event.status in ('cancelled','completed') or v_event.ends_at<=now() then raise exception 'This event is no longer accepting team invitations.' using errcode='22023'; end if;
    if exists(select 1 from public.registrations where event_id=p_event_id and user_id=v_uid and status in ('confirmed','pending','waitlisted','offered')) then
      raise exception 'Cancel your attendee RSVP before joining this event team.' using errcode='22023';
    end if;
    -- Never overwrite an existing role or transfer ownership on retry.
    insert into public.event_members(event_id,user_id,member_role) values(p_event_id,v_uid,v_invite.member_role) on conflict do nothing;
  end if;
  update public.event_team_invitations set status=v_next,updated_at=now() where event_id=p_event_id and user_id=v_uid;
end $$;
revoke all on function public.event_team_workspace(uuid) from public,anon,authenticated;
revoke all on function public.search_event_team_people(uuid,text) from public,anon,authenticated;
revoke all on function public.invite_event_team_member(uuid,uuid,public.member_role) from public,anon,authenticated;
revoke all on function public.my_event_teams() from public,anon,authenticated;
revoke all on function public.respond_event_team_invitation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.event_team_workspace(uuid) to authenticated;
grant execute on function public.search_event_team_people(uuid,text) to authenticated;
grant execute on function public.invite_event_team_member(uuid,uuid,public.member_role) to authenticated;
grant execute on function public.my_event_teams() to authenticated;
grant execute on function public.respond_event_team_invitation(uuid,boolean) to authenticated;
commit;
