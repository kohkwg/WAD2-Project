-- RSVP / waitlist rules agreed with Huxley on 22 Oct 2026 after the signed-in live test
-- (Gregory to review). Bodies are the live definitions with only the marked changes.
--   1. Organisers and helpers cannot RSVP to their own event.
--   2. A participant who has checked in cannot cancel.
--   3. Waitlist offers never outlive the event start, and no offers are made once it starts.

create or replace function public.register_for_event(p_event_id uuid, p_answers jsonb default '[]'::jsonb)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  e        public.events;
  v_status public.registration_status;
  v_held   int;
  v_reg    public.registrations;
  q        record;
begin
  if auth.uid() is null then raise exception 'Sign in to register'; end if;

  select * into e from public.events where id = p_event_id for update;
  if not found or e.status <> 'published' then raise exception 'This event is not open for registration'; end if;
  -- Rule 1 (new): the event's own team cannot take participant spots
  if e.organiser_id = auth.uid() or public.is_event_staff(p_event_id) then
    raise exception 'Organisers and helpers can''t RSVP to their own event';
  end if;
  if e.registration_closes_at is not null and now() > e.registration_closes_at then raise exception 'Registration has closed'; end if;
  if now() > e.ends_at then raise exception 'This event has ended'; end if;

  for q in select id, prompt from public.event_questions where event_id = p_event_id and required loop
    if not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where a ->> 'question_id' = q.id::text and nullif(a ->> 'answer', '') is not null
    ) then
      raise exception 'Please answer: %', q.prompt;
    end if;
  end loop;

  select count(*) into v_held from public.registrations
  where event_id = p_event_id and status in ('confirmed', 'offered');

  v_status := case
    when e.requires_approval then 'pending'
    when e.capacity is not null and v_held >= e.capacity then 'waitlisted'
    else 'confirmed'
  end;

  insert into public.registrations (event_id, user_id, status)
  values (p_event_id, auth.uid(), v_status)
  on conflict (event_id, user_id) do update
    set status = excluded.status, offer_expires_at = null, late_cancel = false,
        created_at = now(), decided_at = null, decided_by = null
    -- signing up again after cancelling, declining or letting an offer expire
    where public.registrations.status in ('cancelled', 'declined', 'expired')
  returning * into v_reg;

  if not found then raise exception 'You already have an RSVP for this event'; end if;

  delete from public.registration_answers where registration_id = v_reg.id;
  insert into public.registration_answers (registration_id, question_id, answer)
  select v_reg.id, q2.id, a -> 'answer'
  from jsonb_array_elements(p_answers) a
  join public.event_questions q2 on q2.id::text = a ->> 'question_id' and q2.event_id = p_event_id;

  return v_reg;
end $$;

create or replace function public.cancel_registration(p_event_id uuid)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare v_reg public.registrations;
begin
  -- Rule 2 (new): attendance is a recorded fact; a checked-in RSVP stays
  if exists (
    select 1 from public.check_ins c
    where c.event_id = p_event_id and c.user_id = auth.uid()
  ) then
    raise exception 'You have already checked in, so this RSVP can''t be cancelled';
  end if;

  update public.registrations set status = 'cancelled'
  where event_id = p_event_id and user_id = auth.uid()
    and status in ('pending', 'confirmed', 'waitlisted', 'offered')
  returning * into v_reg;
  if not found then raise exception 'No active registration to cancel'; end if;
  return v_reg;
end $$;

create or replace function public._promote_waitlist(p_event_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_cap    int;
  v_status public.event_status;
  v_start  timestamptz;
  v_spots  int;
  v_n      int := 0;
begin
  select capacity, status, starts_at into v_cap, v_status, v_start
  from public.events where id = p_event_id for update;
  -- Rule 3 (changed): stop promoting once the event has started (was: once it ended)
  if not found or v_status <> 'published' or v_start <= now() then return 0; end if;

  if v_cap is null then
    update public.registrations set status = 'confirmed'
    where event_id = p_event_id and status = 'waitlisted';
    get diagnostics v_n = row_count;
    return v_n;
  end if;

  select v_cap - count(*) into v_spots
  from public.registrations where event_id = p_event_id and status in ('confirmed', 'offered');
  if v_spots <= 0 then return 0; end if;

  update public.registrations
     -- Rule 3 (changed): the 24-hour window is cut off at the event start
     set status = 'offered', offer_expires_at = least(now() + interval '24 hours', v_start)
  where id in (
    select s.registration_id
    from public._registration_scores(p_event_id) s
    where s.status = 'waitlisted'
    order by s.waitlist_rank
    limit v_spots
  );
  get diagnostics v_n = row_count;
  return v_n;
end $$;
