-- Live Feature 4 database contract.
-- Owner checks use events.organiser_id directly; event_members is not an authority
-- for this feature. The imported switch function is retained by name but fails closed
-- until trusted forecast evidence can be verified by a server-side writer.

-- Settings visible only to the event owner. NULL means no configured value.
create table public.event_operation_settings (
  event_id uuid primary key references public.events (id) on delete cascade,
  budget_limit numeric(12, 2) check (budget_limit is null or budget_limit > 0),
  forecast_area text check (forecast_area is null or (btrim(forecast_area) <> '' and char_length(forecast_area) <= 120)),
  updated_at timestamptz not null default now()
);
alter table public.event_operation_settings enable row level security;
create policy "Event owners manage operation settings"
  on public.event_operation_settings for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and e.organiser_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = event_id and e.organiser_id = (select auth.uid())
  ));
grant select, insert, update, delete on public.event_operation_settings to authenticated;

create or replace function public.event_operation_settings_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger event_operation_settings_before_write
  before insert or update on public.event_operation_settings
  for each row execute function public.event_operation_settings_before_write();
revoke execute on function public.event_operation_settings_before_write() from public, anon, authenticated;

-- Atomic one-field settings updates preserve the other setting under concurrent
-- requests. These invoker RPCs remain subject to the table RLS policy.
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
    select 1 from public.events e where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the event owner can change the budget limit';
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
revoke execute on function public.set_feature4_budget_limit(uuid, numeric) from public, anon;
grant execute on function public.set_feature4_budget_limit(uuid, numeric) to authenticated;

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
    select 1 from public.events e where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the event owner can change the forecast area';
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
revoke execute on function public.set_feature4_forecast_area(uuid, text) from public, anon;
grant execute on function public.set_feature4_forecast_area(uuid, text) to authenticated;

-- Existing announcement rows gain an edit timestamp that remains NULL until edited.
-- Public reads continue to use the preceding 20261022055852_public_announcements migration.
alter table public.announcements
  add column updated_at timestamptz default null;

create or replace function public.feature4_announcement_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- An event deletion cascades to its posts after the parent row is gone.
    -- Keep direct deletion of automatic history blocked while that event exists.
    if old.is_automatic and exists (
      select 1 from public.events e where e.id = old.event_id
    ) then
      raise exception 'Automatic announcements are immutable';
    end if;
    return old;
  end if;
  if old.is_automatic then
    raise exception 'Automatic announcements are immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger feature4_announcement_before_write
  before update or delete on public.announcements
  for each row execute function public.feature4_announcement_before_write();
revoke execute on function public.feature4_announcement_before_write() from public, anon, authenticated;

-- The task board is private to the event owner. Remove the imported helper access
-- and membership-based organiser checks for this feature.
drop policy if exists "Team sees relevant tasks" on public.tasks;
drop policy if exists "Organisers create tasks" on public.tasks;
drop policy if exists "Organisers and responsible helpers update tasks" on public.tasks;
drop policy if exists "Organisers delete tasks" on public.tasks;
create policy "Event owners read tasks"
  on public.tasks for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));
create policy "Event owners create tasks"
  on public.tasks for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));
create policy "Event owners update tasks"
  on public.tasks for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));
create policy "Event owners delete tasks"
  on public.tasks for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));

-- Make budget access exactly event-owner scoped, independent of event_members.
drop policy if exists "Organisers manage budget" on public.budget_items;
create policy "Event owners manage budget"
  on public.budget_items for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));

-- Retain public/participant reads, but restrict all writes to the owner. Automatic
-- rows cannot be edited/deleted even by the owner (also enforced by trigger above).
drop policy if exists "Organisers post announcements" on public.announcements;
drop policy if exists "Organisers edit announcements" on public.announcements;
drop policy if exists "Organisers delete announcements" on public.announcements;
create policy "Event owners post announcements"
  on public.announcements for insert to authenticated
  with check (
    not is_automatic and author_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid()))
  );
create policy "Event owners edit manual announcements"
  on public.announcements for update to authenticated
  using (not is_automatic and exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())))
  with check (not is_automatic and exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));
create policy "Event owners delete manual announcements"
  on public.announcements for delete to authenticated
  using (not is_automatic and exists (select 1 from public.events e where e.id = event_id and e.organiser_id = (select auth.uid())));

-- Updated-at is an owner-controlled field only through the trigger.
grant select (id, event_id, body, audience, is_automatic, created_at, updated_at)
  on public.announcements to anon;
grant select (updated_at) on public.announcements to authenticated;
revoke update on public.announcements from anon, authenticated;
grant update (body) on public.announcements to authenticated;

-- Serialize all task writes for one event with a lock on its parent event row.
-- The board RPC takes the same lock before validating its complete ID set.
create or replace function public.feature4_lock_task_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id then
    raise exception 'A task cannot be moved to another event';
  end if;
  perform 1 from public.events e where e.id =
    case when tg_op = 'DELETE' then old.event_id else new.event_id end for update;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Task event does not exist';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger feature4_lock_task_event
  before insert or update or delete on public.tasks
  for each row execute function public.feature4_lock_task_event();
revoke execute on function public.feature4_lock_task_event() from public, anon, authenticated;

-- Atomic full-board save. The input must contain exactly three arrays, and the IDs
-- must be a permutation of this event's complete task set. Any error rolls back.
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
  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Only the event owner can save this task board';
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
    select value::uuid as id
    from jsonb_each(p_columns) c
    cross join lateral jsonb_array_elements_text(c.value)
  )
  select count(*), count(distinct id) into v_total, v_distinct from submitted;

  if v_total <> v_distinct or v_total <> (select count(*) from public.tasks where event_id = p_event_id) then
    raise exception 'Task board must include every task exactly once';
  end if;
  if exists (
    with submitted as (
      select value::uuid as id
      from jsonb_each(p_columns) c
      cross join lateral jsonb_array_elements_text(c.value)
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
    select value::uuid as id, key::public.task_status as status, (ord - 1)::integer as position
    from jsonb_each(p_columns) c
    cross join lateral jsonb_array_elements_text(c.value) with ordinality as x(value, ord)
  )
  update public.tasks t
     set status = b.status, position = b.position, updated_at = now()
    from board b
   where t.id = b.id and t.event_id = p_event_id;
end;
$$;
revoke execute on function public.save_feature4_task_board(uuid, jsonb) from public, anon;
grant execute on function public.save_feature4_task_board(uuid, jsonb) to authenticated;

-- Create a todo task while holding the event lock used by every other task
-- mutation, so concurrent clients cannot allocate the same next position.
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
  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Only the event owner can create tasks';
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
revoke execute on function public.create_feature4_task(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_feature4_task(uuid, uuid, text, text) to authenticated;

-- Delete a task and compact the remaining order in each status column atomically.
-- Returns 1 when a row was deleted and 0 when the task was already absent.
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
  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Only the event owner can delete this task';
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
revoke execute on function public.delete_feature4_task(uuid, uuid) from public, anon;
grant execute on function public.delete_feature4_task(uuid, uuid) to authenticated;

-- No trusted weather-evidence architecture exists in this migration. Block the
-- imported reversible RPC and direct event-row attempts to alter using_backup.
create or replace function public.switch_event_venue(
  p_event_id uuid, p_use_backup boolean default true, p_message text default null
)
returns public.announcements
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Venue switching is unavailable until trusted weather evidence is configured';
end;
$$;
revoke execute on function public.switch_event_venue(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.switch_event_venue(uuid, boolean, text) to authenticated;

create or replace function public.feature4_prevent_untrusted_venue_switch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.using_backup is distinct from old.using_backup then
    raise exception 'Venue switching is unavailable until trusted weather evidence is configured';
  end if;
  return new;
end;
$$;
create trigger feature4_prevent_untrusted_venue_switch
  before update of using_backup on public.events
  for each row execute function public.feature4_prevent_untrusted_venue_switch();
revoke execute on function public.feature4_prevent_untrusted_venue_switch() from public, anon, authenticated;
