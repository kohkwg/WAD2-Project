-- Feature 3 -> Feature 1: "RSVPing to or attending an event raises the weights of its
-- tags" (proposal). Agreed with Huxley on 23 Oct 2026: a database trigger, so every
-- check-in method counts (staff scan, barcode, manual, self check-in, CSV import).
-- check_ins has one row per registration (unique registration_id), so repeat scans
-- never double-count. Mirrors Aishani's bumpInterestWeights() in
-- server/services/recommendation.js: attend boost 1.0, weights capped at 5.

create or replace function public.check_ins_bump_interests()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_weights jsonb;
  v_tag     text;
begin
  select coalesce(interest_weights, '{}'::jsonb) into v_weights
  from public.profiles where id = new.user_id
  for update;
  if not found then return null; end if;

  for v_tag in
    select i.slug
    from public.event_interests ei
    join public.interests i on i.id = ei.interest_id
    where ei.event_id = new.event_id
  loop
    v_weights := jsonb_set(
      v_weights, array[v_tag],
      to_jsonb(least(5, coalesce((v_weights ->> v_tag)::numeric, 0) + 1.0))
    );
  end loop;

  update public.profiles set interest_weights = v_weights where id = new.user_id;
  return null;
end $$;

-- Trigger-only: not callable through the API
revoke execute on function public.check_ins_bump_interests() from public, anon, authenticated;

create trigger check_ins_bump_interests
after insert on public.check_ins
for each row execute function public.check_ins_bump_interests();
