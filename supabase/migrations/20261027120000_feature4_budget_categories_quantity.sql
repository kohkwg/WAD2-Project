-- Feature 4 budget: per-event custom categories and expense quantities.
-- Expense amounts remain line totals (unit cost x quantity); existing rows become quantity 1.

alter table public.event_operation_settings
  add column budget_categories text[] not null default '{}'
    check (cardinality(budget_categories) <= 50);

alter table public.budget_items
  add column quantity integer not null default 1
    check (quantity between 1 and 100000);

-- Line totals must split into whole-cent unit costs so the editor can show them exactly.
alter table public.budget_items
  add constraint budget_items_whole_cent_unit_costs check (
    mod(estimated_amount * 100, quantity) = 0
    and (actual_amount is null or mod(actual_amount * 100, quantity) = 0)
  );

-- Invoker RPCs stay subject to the owner-only RLS on both tables.
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
    select 1 from public.events e where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the event owner can change budget categories';
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
revoke execute on function public.add_feature4_budget_category(uuid, text) from public, anon;
grant execute on function public.add_feature4_budget_category(uuid, text) to authenticated;

-- Deleting a custom category moves its expenses to Other in the same transaction.
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
    select 1 from public.events e where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the event owner can change budget categories';
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
revoke execute on function public.delete_feature4_budget_category(uuid, text) from public, anon;
grant execute on function public.delete_feature4_budget_category(uuid, text) to authenticated;
