-- Development verification only. All fixtures, including the third auth user,
-- are rolled back. Run against the development project, never a production DB.
begin;
do $$
declare
  owner_id uuid := (select id from auth.users where email='test1@example.com');
  participant_id uuid := (select id from auth.users where email='test2@example.com');
  extra_id uuid := gen_random_uuid();
  event_id uuid;
  first_reg public.registrations;
  second_reg public.registrations;
  event_start timestamptz := now() + interval '1 hour';
begin
  if owner_id is null or participant_id is null then raise exception 'Development test accounts are required'; end if;
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values(extra_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'bookedz-test-'||extra_id||'@example.invalid','{"full_name":"[TEST] rolled-back waitlist participant"}','{}',now(),now());
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  event_id := public.create_event_with_details(gen_random_uuid(),jsonb_build_object(
    'title','[TEST] rolled-back waitlist verification','description','Disposable SQL fixture',
    'startTime',event_start,'endTime',event_start+interval '1 hour','capacity',1,'requiresApproval',false,'isOutdoor',false,
    'venue',jsonb_build_object('name','[TEST] rolled-back venue','address','80 Stamford Road','postal','178902','lat',1.2974,'lng',103.8496),
    'backupVenue',null,'tags',jsonb_build_array('gaming'),'questions','[]'::jsonb));
  perform set_config('request.jwt.claim.sub',participant_id::text,true);
  first_reg := public.register_for_event(event_id,'[]');
  if first_reg.status <> 'confirmed' then raise exception 'First registration should confirm'; end if;
  perform set_config('request.jwt.claim.sub',extra_id::text,true);
  second_reg := public.register_for_event(event_id,'[]');
  if second_reg.status <> 'waitlisted' then raise exception 'Full event should waitlist'; end if;
  perform set_config('request.jwt.claim.sub',participant_id::text,true);
  perform public.cancel_registration(event_id);
  select * into second_reg from public.registrations where id=second_reg.id;
  if second_reg.status <> 'offered' then raise exception 'Cancellation should promote the waitlist'; end if;
  if second_reg.offer_expires_at <> event_start then raise exception 'Offer must end at event start'; end if;
  perform set_config('request.jwt.claim.sub',extra_id::text,true);
  second_reg := public.respond_to_offer(second_reg.id,true);
  if second_reg.status <> 'confirmed' then raise exception 'Accepting an offer should confirm'; end if;
  if has_function_privilege('authenticated','public.commit_trusted_venue_switch(uuid,uuid,jsonb)','execute') then
    raise exception 'Authenticated users must not invoke the trusted venue transaction directly';
  end if;
end $$;
rollback;
select 'Live waitlist lifecycle and event-start deadline passed; all fixtures rolled back' as result;
