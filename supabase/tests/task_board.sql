-- Development/local PostgreSQL regression. Requires the application migrations.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/task_board.sql.
-- All fixtures and changes roll back; existing events are never modified.
begin;
create temporary table task_board_fixture (
  owner_id uuid, other_id uuid, event_id uuid, empty_id uuid, foreign_id uuid,
  task_a uuid, task_b uuid, task_c uuid, foreign_task uuid
);
insert into task_board_fixture select gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid();
do $$
declare f task_board_fixture;
begin
  select * into f from task_board_fixture;
  insert into auth.users(id, email, raw_user_meta_data) values
    (f.owner_id, 'task-board-' || f.owner_id || '@example.invalid', '{"full_name":"[TEST] task board owner"}'),
    (f.other_id, 'task-board-' || f.other_id || '@example.invalid', '{"full_name":"[TEST] other owner"}');
  insert into public.events(id, organiser_id, title, starts_at, ends_at) values
    (f.event_id, f.owner_id, '[TEST] task board', now() + interval '1 day', now() + interval '2 days'),
    (f.empty_id, f.owner_id, '[TEST] empty board', now() + interval '1 day', now() + interval '2 days'),
    (f.foreign_id, f.owner_id, '[TEST] foreign board', now() + interval '1 day', now() + interval '2 days');
  insert into public.tasks(id, event_id, title, status, position) values
    (f.task_a, f.event_id, '[TEST] A', 'todo', 0),
    (f.task_b, f.event_id, '[TEST] B', 'todo', 1),
    (f.task_c, f.event_id, '[TEST] C', 'done', 0),
    (f.foreign_task, f.foreign_id, '[TEST] foreign', 'todo', 0);
end $$;
grant select on task_board_fixture to authenticated;
set local role authenticated;
do $$
declare
  f task_board_fixture;
  board jsonb;
  invalid_board jsonb;
  expected_message text;
begin
  select * into f from task_board_fixture;
  perform set_config('request.jwt.claim.sub', f.owner_id::text, true);
  board := jsonb_build_object('todo', jsonb_build_array(f.task_c, f.task_a),
    'in_progress', jsonb_build_array(f.task_b), 'done', '[]'::jsonb);
  perform public.save_feature4_task_board(f.event_id, board);
  if (select count(*) from public.tasks where event_id = f.event_id and (
    (id = f.task_c and status = 'todo' and position = 0) or
    (id = f.task_a and status = 'todo' and position = 1) or
    (id = f.task_b and status = 'in_progress' and position = 0))) <> 3 then
    raise exception 'Status and order were not persisted';
  end if;
  -- Retrying the same board must succeed without changing its order.
  perform public.save_feature4_task_board(f.event_id, board);
  perform public.save_feature4_task_board(f.empty_id, '{"todo":[],"in_progress":[],"done":[]}');

  for invalid_board, expected_message in
    select board || jsonb_build_object('todo', jsonb_build_array(f.task_a, f.task_a)),
      'Task board must include every task exactly once'
    union all select board || '{"todo":[]}'::jsonb,
      'Task board must include every task exactly once'
    union all select board || jsonb_build_object('todo', jsonb_build_array(f.task_c, f.foreign_task)),
      'Task board IDs must belong to this event'
    union all select board || '{"todo":{}}'::jsonb,
      'Task board columns must be arrays of task IDs'
    union all select board || '{"todo":[1]}'::jsonb,
      'Task board columns must be arrays of task IDs'
  loop
    begin
      perform public.save_feature4_task_board(f.event_id, invalid_board);
      raise exception 'Invalid board unexpectedly succeeded';
    exception when others then
      if sqlerrm <> expected_message then raise; end if;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', f.other_id::text, true);
  begin
    perform public.save_feature4_task_board(f.event_id, board);
    raise exception 'Non-owner save unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Only the event owner can save this task board' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', f.owner_id::text, true);
  if (select jsonb_agg(id order by position) from public.tasks
      where event_id = f.event_id and status = 'todo') <> jsonb_build_array(f.task_c, f.task_a)
     or (select count(*) from public.tasks where event_id = f.event_id and status = 'in_progress' and id = f.task_b and position = 0) <> 1 then
    raise exception 'Rejected saves changed the saved board';
  end if;
  if not has_function_privilege('authenticated', 'public.save_feature4_task_board(uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.save_feature4_task_board(uuid,jsonb)', 'execute') then
    raise exception 'Task-board execute grants changed';
  end if;
end $$;
rollback;
select 'Task-board status/order, retry, empty board, validation, ownership, atomicity and grants passed; fixtures rolled back' as result;
