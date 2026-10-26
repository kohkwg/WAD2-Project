-- Qualify task IDs from the inner array expansion: jsonb_each also exposes value.
-- Preserve the owner check, event lock, full-board validation and invoker/RLS contract.
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
revoke execute on function public.save_feature4_task_board(uuid, jsonb) from public, anon;
grant execute on function public.save_feature4_task_board(uuid, jsonb) to authenticated;
