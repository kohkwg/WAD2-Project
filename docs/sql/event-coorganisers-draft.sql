-- REVIEW ONLY: coordinate with Timothy and compare hosted migration history before applying.
-- Apply AFTER event-team-invitations-draft.sql. Existing helpers become co-organisers.
-- Co-organisers have the same event permissions as the owner, including delete/invites.
begin;
update public.event_members set member_role = 'organiser', helper_role_id = null where member_role = 'helper';
update public.event_team_invitations set member_role = 'organiser';

drop policy if exists "Event owners manage operation settings" on public.event_operation_settings;
create policy "Event owners manage operation settings"
  on public.event_operation_settings for all to authenticated
  using (public.is_event_organiser(event_id))
  with check (public.is_event_organiser(event_id));

drop policy if exists "Event owners read tasks" on public.tasks;
create policy "Event owners read tasks"
  on public.tasks for select to authenticated
  using (public.is_event_organiser(event_id));

drop policy if exists "Event owners create tasks" on public.tasks;
create policy "Event owners create tasks"
  on public.tasks for insert to authenticated
  with check (public.is_event_organiser(event_id));

drop policy if exists "Event owners update tasks" on public.tasks;
create policy "Event owners update tasks"
  on public.tasks for update to authenticated
  using (public.is_event_organiser(event_id))
  with check (public.is_event_organiser(event_id));

drop policy if exists "Event owners delete tasks" on public.tasks;
create policy "Event owners delete tasks"
  on public.tasks for delete to authenticated
  using (public.is_event_organiser(event_id));

drop policy if exists "Event owners manage budget" on public.budget_items;
create policy "Event owners manage budget"
  on public.budget_items for all to authenticated
  using (public.is_event_organiser(event_id))
  with check (public.is_event_organiser(event_id));

drop policy if exists "Event owners post announcements" on public.announcements;
create policy "Event owners post announcements"
  on public.announcements for insert to authenticated
  with check (
    not is_automatic and author_id = (select auth.uid())
    and public.is_event_organiser(event_id)
  );

drop policy if exists "Event owners edit manual announcements" on public.announcements;
create policy "Event owners edit manual announcements"
  on public.announcements for update to authenticated
  using (not is_automatic and public.is_event_organiser(event_id))
  with check (not is_automatic and public.is_event_organiser(event_id));

drop policy if exists "Event owners delete manual announcements" on public.announcements;
create policy "Event owners delete manual announcements"
  on public.announcements for delete to authenticated
  using (not is_automatic and public.is_event_organiser(event_id));

create or replace function public.set_feature4_budget_limit(p_event_id uuid, p_limit numeric)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limit numeric(12, 2);
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and public.is_event_organiser(e.id)
  ) then
    raise exception 'Only event organisers can change the budget limit';
  end if;
  if p_limit is not null and (p_limit <= 0 or p_limit > 9999999999.99 or p_limit <> round(p_limit, 2)) then
    raise exception 'Budget limit must be positive and use at most two decimal places';
  end if;
  v_limit := p_limit;
  insert into public.event_operation_settings (event_id, budget_limit)
  values (p_event_id, v_limit)
  on conflict (event_id) do update set budget_limit = excluded.budget_limit
  returning budget_limit into v_limit;
  return v_limit;
end;
$$;

create or replace function public.set_feature4_forecast_area(p_event_id uuid, p_area text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_area text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and public.is_event_organiser(e.id)
  ) then
    raise exception 'Only event organisers can change the forecast area';
  end if;
  if p_area is not null and (btrim(p_area) = '' or char_length(p_area) > 120) then
    raise exception 'Forecast area must be non-empty and at most 120 characters';
  end if;
  insert into public.event_operation_settings (event_id, forecast_area)
  values (p_event_id, p_area)
  on conflict (event_id) do update set forecast_area = excluded.forecast_area
  returning forecast_area into v_area;
  return v_area;
end;
$$;

create or replace function public.save_feature4_task_board(p_event_id uuid, p_columns jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_distinct integer;
  v_owner uuid;
begin
  select e.organiser_id into v_owner
  from public.events e where e.id = p_event_id for update;
  if auth.uid() is null or not public.is_event_organiser(p_event_id) then
    raise exception 'Only event organisers can save this task board';
  end if;
  if p_columns is null or jsonb_typeof(p_columns) is distinct from 'object' then
    raise exception 'Task board must be an object';
  end if;
  if (select count(*) from jsonb_object_keys(p_columns)) <> 3
     or not (p_columns ?& array['todo', 'in_progress', 'done']) then
    raise exception 'Task board must contain exactly todo, in_progress, and done columns';
  end if;
  if exists (
    select 1 from jsonb_each(p_columns) c
    where jsonb_typeof(c.value) is distinct from 'array'
  ) then
    raise exception 'Task board columns must be arrays of task IDs';
  end if;
  if exists (
    select 1 from jsonb_each(p_columns) c
    cross join lateral jsonb_array_elements(c.value) x
    where jsonb_typeof(x) is distinct from 'string'
  ) then
    raise exception 'Task board columns must be arrays of task IDs';
  end if;

  with submitted as (
    select x.value::uuid as id
    from jsonb_each(p_columns) c
    cross join lateral jsonb_array_elements_text(c.value) as x(value)
  )
  select count(*), count(distinct id) into v_total, v_distinct from submitted;

  if v_total <> v_distinct or v_total <> (select count(*) from public.tasks where event_id = p_event_id) then
    raise exception 'Task board must include every task exactly once';
  end if;
  if exists (
    with submitted as (
      select x.value::uuid as id
      from jsonb_each(p_columns) c
      cross join lateral jsonb_array_elements_text(c.value) as x(value)
    ), actual as (
      select id from public.tasks where event_id = p_event_id
    )
    (select id from submitted except select id from actual)
    union all
    (select id from actual except select id from submitted)
  ) then
    raise exception 'Task board IDs must belong to this event';
  end if;

  with board as (
    select x.value::uuid as id, c.key::public.task_status as status, (x.ord - 1)::integer as position
    from jsonb_each(p_columns) c
    cross join lateral jsonb_array_elements_text(c.value) with ordinality as x(value, ord)
  )
  update public.tasks t
     set status = b.status, position = b.position, updated_at = now()
    from board b
   where t.id = b.id and t.event_id = p_event_id;
end;
$$;

create or replace function public.create_feature4_task(
  p_event_id uuid, p_task_id uuid, p_title text, p_description text
)
returns public.tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_position integer;
  v_task public.tasks;
begin
  select e.organiser_id into v_owner
  from public.events e where e.id = p_event_id for update;
  if auth.uid() is null or not public.is_event_organiser(p_event_id) then
    raise exception 'Only event organisers can create tasks';
  end if;
  if p_title is null or btrim(p_title) = '' or char_length(p_title) > 200 then
    raise exception 'Task title must be non-empty and at most 200 characters';
  end if;
  select coalesce(max(t.position), -1) + 1 into v_position
  from public.tasks t where t.event_id = p_event_id and t.status = 'todo';
  if p_task_id is null then
    raise exception 'Task request ID is required';
  end if;
  insert into public.tasks (id, event_id, title, description, status, position, created_by)
  values (p_task_id, p_event_id, btrim(p_title), p_description, 'todo', v_position, auth.uid())
  on conflict (id) do nothing
  returning * into v_task;
  if not found then
    select t.* into v_task from public.tasks t
    where t.id = p_task_id and t.event_id = p_event_id;
    if not found or v_task.title is distinct from btrim(p_title)
       or v_task.description is distinct from p_description then
      raise exception 'Task request ID was already used for a different task';
    end if;
  end if;
  return v_task;
end;
$$;

create or replace function public.delete_feature4_task(p_event_id uuid, p_task_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_deleted integer;
begin
  select e.organiser_id into v_owner
  from public.events e where e.id = p_event_id for update;
  if auth.uid() is null or not public.is_event_organiser(p_event_id) then
    raise exception 'Only event organisers can delete this task';
  end if;
  delete from public.tasks where id = p_task_id and event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then return 0; end if;
  with compacted as (
    select id, (row_number() over (partition by status order by position, id) - 1)::integer as new_position
    from public.tasks where event_id = p_event_id
  )
  update public.tasks t set position = c.new_position, updated_at = now()
  from compacted c where t.id = c.id and t.position is distinct from c.new_position;
  return v_deleted;
end;
$$;

create or replace function public.add_feature4_budget_category(p_event_id uuid, p_name text)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_categories text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and public.is_event_organiser(e.id)
  ) then
    raise exception 'Only event organisers can change budget categories';
  end if;
  if v_name = '' or char_length(v_name) > 40 then
    raise exception 'Category names must be 1 to 40 characters';
  end if;
  insert into public.event_operation_settings (event_id) values (p_event_id)
  on conflict (event_id) do nothing;
  select budget_categories into v_categories
  from public.event_operation_settings where event_id = p_event_id
  for update;
  if exists (
    select 1 from unnest(v_categories || array['Food & drink', 'Venue', 'Equipment', 'Marketing', 'Other']) as existing(name)
    where lower(existing.name) = lower(v_name)
  ) then
    raise exception '"%" is already a category', v_name;
  end if;
  update public.event_operation_settings
  set budget_categories = array_append(v_categories, v_name)
  where event_id = p_event_id
  returning budget_categories into v_categories;
  return v_categories;
end;
$$;

create or replace function public.delete_feature4_budget_category(p_event_id uuid, p_name text)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categories text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and public.is_event_organiser(e.id)
  ) then
    raise exception 'Only event organisers can change budget categories';
  end if;
  select budget_categories into v_categories
  from public.event_operation_settings where event_id = p_event_id
  for update;
  if v_categories is null or not (p_name = any(v_categories)) then
    raise exception 'Only custom categories can be deleted';
  end if;
  update public.budget_items set category = 'Other'
  where event_id = p_event_id and category = p_name;
  update public.event_operation_settings
  set budget_categories = array_remove(v_categories, p_name)
  where event_id = p_event_id
  returning budget_categories into v_categories;
  return v_categories;
end;
$$;

drop policy if exists "Only owners delete events" on public.events;
drop policy if exists "Organisers delete events" on public.events;
create policy "Organisers delete events" on public.events for delete to authenticated
using (public.is_event_organiser(id));
drop policy if exists "Only owners manage team" on public.event_members;
drop policy if exists "Organisers manage team" on public.event_members;
create policy "Organisers manage team" on public.event_members for all to authenticated
using (public.is_event_organiser(event_id))
with check (public.is_event_organiser(event_id));

-- Existing events_before_write keeps organiser_id immutable.

create or replace function public.add_event_member_by_email(
  p_event_id uuid, p_email text,
  p_role public.member_role default 'organiser', p_helper_role_id uuid default null
)
returns public.event_members language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  m      public.event_members;
begin
  if not public.is_event_organiser(p_event_id) then raise exception 'Only event organisers can add team members'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No account found for %', p_email; end if;
  if p_helper_role_id is not null and not exists (
    select 1 from public.helper_roles where id = p_helper_role_id and event_id = p_event_id
  ) then raise exception 'That role does not belong to this event'; end if;

  insert into public.event_members (event_id, user_id, member_role, helper_role_id)
  values (p_event_id, v_user, 'organiser', null)
  on conflict (event_id, user_id) do update
    set member_role = excluded.member_role, helper_role_id = excluded.helper_role_id
  returning * into m;
  return m;
end $$;

create or replace function public.invite_event_team_member(p_event_id uuid,p_user_id uuid,p_role public.member_role)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_event public.events; v_old public.event_team_invitations;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into v_event from public.events where id=p_event_id for update;
  if not public.is_event_organiser(p_event_id) then raise exception 'Only event organisers can invite people.' using errcode='42501'; end if;
  if v_event.status in ('cancelled','completed') or v_event.ends_at<=now() then raise exception 'This event is no longer accepting team invitations.' using errcode='22023'; end if;
  if p_user_id is null or p_user_id=v_uid then raise exception 'Choose another account.' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and username is not null) then raise exception 'No account found with that username.' using errcode='22023'; end if;
  if exists(select 1 from public.event_members where event_id=p_event_id and user_id=p_user_id) then return; end if;
  select * into v_old from public.event_team_invitations where event_id=p_event_id and user_id=p_user_id;
  if v_old.status='pending' then
    return;
  end if;
  insert into public.event_team_invitations(event_id,user_id,invited_by,member_role,status) values(p_event_id,p_user_id,v_uid,'organiser','pending')
    on conflict(event_id,user_id) do update set invited_by=v_uid,member_role='organiser',status='pending',updated_at=now();
end $$;

create or replace function public.respond_event_team_invitation(p_event_id uuid,p_accept boolean)
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
    insert into public.event_members(event_id,user_id,member_role) values(p_event_id,v_uid,'organiser') on conflict do nothing;
  end if;
  update public.event_team_invitations set status=v_next,updated_at=now() where event_id=p_event_id and user_id=v_uid;
end $$;

create or replace function public.event_team_workspace(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_members jsonb; v_pending jsonb;
begin
  select organiser_id into v_owner from public.events where id=p_event_id;
  if v_uid is null or (v_owner is distinct from v_uid and not public.is_event_staff(p_event_id)) then raise exception 'Only this event team can view its members.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'role',m.member_role,'isOwner',p.id=v_owner) order by (p.id=v_owner) desc,m.added_at,p.id),'[]'::jsonb) into v_members
    from public.event_members m join public.profiles p on p.id=m.user_id where m.event_id=p_event_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'role',i.member_role) order by i.created_at,p.id),'[]'::jsonb) into v_pending
    from public.event_team_invitations i join public.profiles p on p.id=i.user_id where i.event_id=p_event_id and i.status='pending' and public.is_event_organiser(p_event_id)
    and not exists(select 1 from public.event_members m where m.event_id=i.event_id and m.user_id=i.user_id);
  return jsonb_build_object('members',v_members,'pending',v_pending,'isOwner',v_owner=v_uid,'canManageTeam',public.is_event_organiser(p_event_id));
end $$;

create or replace function public.search_event_team_people(p_event_id uuid,p_query text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_query text:=lower(btrim(p_query)); v_result jsonb;
begin
  if v_uid is null or not public.is_event_organiser(p_event_id) then raise exception 'Only event organisers can invite people.' using errcode='42501'; end if;
  if v_query is null or v_query !~ '^[a-z0-9_]{3,20}$' then raise exception 'Enter at least 3 letters, numbers or underscores from a username.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'username',p.username) order by p.username),'[]'::jsonb) into v_result
    from (select id,display_name,username from public.profiles where id<>v_uid and starts_with(username,v_query) order by username limit 20) p;
  return v_result;
end $$;

commit;
