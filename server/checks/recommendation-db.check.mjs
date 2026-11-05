// Isolated PostgreSQL verification only. Never reads .env or uses a database URL.
// Pass the path to a temporary PGlite runtime; no application dependency is added.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calculateEventEvidence } from '../services/eventEvidence.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the local path to the PGlite runtime module');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite(); // In-memory PostgreSQL, no network/database credentials.
let passed = 0, failed = 0;
function expect(value, message) { if (!value) throw new Error(message); }
async function test(name, run) {
  try { await run(); passed++; console.log('PASS', name); }
  catch (error) { failed++; console.log('FAIL', name, error.code || '', error.message); }
}
async function query(sql, params = []) { return (await db.query(sql, params)).rows; }
async function denied(sql, params = []) {
  try { await query(sql, params); }
  catch (error) { expect(error.code === '42501', `Expected permission denial, received ${error.code}: ${error.message}`); return; }
  throw new Error('Expected permission denial');
}
async function rejects(sql, params, pattern) {
  try { await query(sql, params); }
  catch (error) { expect(pattern.test(error.message), `Unexpected rejection: ${error.message}`); return; }
  throw new Error('Expected SQL rejection');
}
const OWNER = '10000000-0000-4000-8000-000000000001';
const ALICE = '10000000-0000-4000-8000-000000000002';
const BOB = '10000000-0000-4000-8000-000000000003';
async function asUser(id, role = 'authenticated') {
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}
async function admin() { await db.exec('reset role'); }
async function event(title, capacity = null, approval = false) {
  await asUser(OWNER);
  return (await query(`insert into public.events(title,status,starts_at,ends_at,capacity,requires_approval)
    values ($1,'published',now()+interval '1 hour',now()+interval '3 hours',$2,$3) returning id`, ['[TEST] '+title,capacity,approval]))[0].id;
}
async function register(user, eventId) {
  await asUser(user);
  return (await query("select * from public.register_for_event($1,'[]'::jsonb)", [eventId]))[0];
}
async function snapshot(user, eventId) {
  await asUser(user);
  return (await query('select public.get_recommendation_event_evidence($1) as snapshot',[eventId]))[0].snapshot;
}
async function preference(user, eventId, action) {
  await asUser(user);
  return (await query('select public.set_recommendation_event_preference($1,$2) as snapshot',[eventId,action]))[0].snapshot;
}
try {
await db.exec(`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create publication supabase_realtime;
`);

// Only unsupported platform scheduling extension loading is substituted.
// All repository application migrations, functions, triggers and policies run.
for (const name of (await readdir(root+'/supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
  const sql = (await readFile(root+'/supabase/migrations/'+name,'utf8'))
    .replace('create extension if not exists pg_cron;', '-- local scheduling substitute');
  await db.exec(sql);
}
console.log('Loaded all 11 existing migrations; auth/storage/cron are local platform substitutes.');
await query(`insert into auth.users(id,email) values ($1,'owner@example.invalid'),($2,'alice@example.invalid'),($3,'bob@example.invalid')`,[OWNER,ALICE,BOB]);
await db.exec("insert into public.interests(slug,name) values ('music','Music'),('arts','Arts') on conflict(slug) do nothing");
await query(`update public.profiles set interest_weights='{"music":4}'::jsonb where id=$1`,[ALICE]);
const legacy = await event('existing confirmation');
const legacyReg = await register(ALICE, legacy);
const pending = await event('approval', null, true);
const pendingReg = await register(BOB, pending);
await admin();
await db.exec(await readFile(root+'/docs/sql/recommendation-evidence-draft.sql','utf8'));
console.log('Applied recommendation draft to isolated memory database only.');

await test('draft backfills only currently confirmed records', async () => {
  const a = await snapshot(ALICE,legacy); const b = await snapshot(BOB,pending);
  expect(a.rsvp.active && !!a.rsvp.timestamp, 'Existing confirmation must have a best-known date');
  expect(!b.rsvp.active && b.rsvp.timestamp === null, 'Pending must not be backfilled as confirmed');
});
await test('anonymous users cannot call evidence, preference or profile RPCs', async () => {
  await asUser(null,'anon');
  await denied('select public.get_recommendation_event_evidence($1)',[legacy]);
  await denied("select public.set_recommendation_event_preference($1,'save')",[legacy]);
  await denied("select public.update_recommendation_profile('No',null,null,null,array['music'])");
});
await test('authenticated users without an identity are rejected by RPCs', async () => {
  await asUser(null);
  await denied('select public.get_recommendation_event_evidence($1)',[legacy]);
  await denied("select public.set_recommendation_event_preference($1,'save')",[legacy]);
  await denied("select public.update_recommendation_profile('No',null,null,null,array['music'])");
});
await test('profile RPC saves explicit interests under caller RLS without changing weights or another user', async () => {
  await asUser(ALICE);
  await query("select public.update_recommendation_profile('Alice updated','178902',1.3,103.8,array['music','arts','music'])");
  const profile = (await query('select display_name,interest_weights from public.profiles where id=$1',[ALICE]))[0];
  const links = await query('select * from public.profile_interests');
  expect(profile.display_name === 'Alice updated' && profile.interest_weights.music === 4, 'Explicit save must preserve legacy weights');
  expect(links.length === 2 && links.every(row=>row.profile_id===ALICE), 'Expected own unique explicit selections');
  await asUser(BOB);
  expect((await query('select * from public.profile_interests')).length===0,'Other user should not see Alice selections');
  expect((await query('select display_name from public.profiles where id=$1',[BOB]))[0].display_name==='bob','Other user profile must be unchanged');
});
await test('invalid profile updates roll back details and explicit interest replacement together', async () => {
  await asUser(ALICE);
  await rejects("select public.update_recommendation_profile('Wrong',null,null,null,array['invalid-interest'])",[],/Invalid interest/);
  // Valid interests with an invalid postal format fail after entering the transaction.
  await rejects("select public.update_recommendation_profile('Wrong','bad',null,null,array['arts'])",[],/profiles_postal_code_format/);
  expect((await query('select display_name from public.profiles where id=$1',[ALICE]))[0].display_name==='Alice updated','Profile must roll back');
  expect((await query('select * from public.profile_interests')).length===2,'Interest links must roll back');
});
await test('own-row RLS and revoked writes protect preference timestamps', async () => {
  await preference(ALICE,legacy,'save');
  await asUser(BOB);
  expect((await query('select * from public.user_event_preferences where user_id=$1',[ALICE])).length===0,'Cross-user preferences must be invisible');
  await asUser(ALICE);
  await denied('update public.user_event_preferences set first_confirmed_at=now() where user_id=$1',[ALICE]);
  await denied('delete from public.user_event_preferences where user_id=$1',[ALICE]);
  await denied('select public.capture_recommendation_first_confirmation()');
});
await test('unavailable private events cannot receive preference writes', async () => {
  await asUser(OWNER);
  const draft = (await query("insert into public.events(title,starts_at,ends_at) values ('[TEST] private',now()+interval '1 hour',now()+interval '2 hours') returning id"))[0].id;
  await asUser(ALICE);
  await denied("select public.set_recommendation_event_preference($1,'save')",[draft]);
});
await test('repeated saves, unsave/resave and dismissal undo retain original saved_at', async () => {
  const first = await preference(ALICE,legacy,'save');
  expect((await preference(ALICE,legacy,'save')).save.timestamp===first.save.timestamp,'Duplicate save refreshed date');
  await preference(ALICE,legacy,'unsave');
  expect((await preference(ALICE,legacy,'save')).save.timestamp===first.save.timestamp,'Resave refreshed date');
  expect((await preference(ALICE,legacy,'dismiss')).dismissed,'Dismissal must be active');
  const restored = await preference(ALICE,legacy,'undo_dismiss');
  expect(!restored.dismissed && restored.save.timestamp===first.save.timestamp,'Undo must preserve positive history');
});
await test('direct confirmed inserts capture first confirmation and cancellation/reconfirmation preserve it', async () => {
  const id = await event('reconfirmation');
  const reg = await register(ALICE,id);
  expect(reg.status==='confirmed','Direct registration should confirm');
  const first = await snapshot(ALICE,id);
  expect(first.rsvp.active && !!first.rsvp.timestamp,'Direct insert should capture date');
  await asUser(ALICE); await query('select public.cancel_registration($1)',[id]);
  expect(!(await snapshot(ALICE,id)).rsvp.active,'Cancelled evidence should be inactive');
  await register(ALICE,id);
  expect((await snapshot(ALICE,id)).rsvp.timestamp===first.rsvp.timestamp,'Reconfirmation must not refresh first date');
});
await test('pending approval earns no RSVP points; organiser confirmation captures first date', async () => {
  expect(!(await snapshot(BOB,pending)).rsvp.active,'Pending must not earn RSVP points');
  await asUser(OWNER);
  await query("update public.registrations set status='confirmed' where id=$1",[pendingReg.id]);
  const confirmed = await snapshot(BOB,pending);
  expect(confirmed.rsvp.active && !!confirmed.rsvp.timestamp,'Approval transition should capture confirmation');
});
await test('real cancellation promotes waitlist and accepting an offer confirms with first timestamp', async () => {
  const id = await event('waitlist',1);
  await register(ALICE,id);
  const waiting = await register(BOB,id);
  expect(waiting.status==='waitlisted','Second registration should waitlist');
  expect(!(await snapshot(BOB,id)).rsvp.active,'Waitlist must not earn RSVP evidence');
  await asUser(ALICE); await query('select public.cancel_registration($1)',[id]);
  await asUser(BOB);
  const offered = (await query('select status,offer_expires_at from public.registrations where id=$1',[waiting.id]))[0];
  expect(offered.status==='offered' && !!offered.offer_expires_at,'Cancellation should offer freed place');
  expect(!(await snapshot(BOB,id)).rsvp.active,'Offer must not earn confirmed evidence');
  await asUser(BOB);
  const accepted = (await query('select * from public.respond_to_offer($1,true)',[waiting.id]))[0];
  expect(accepted.status==='confirmed','Offer acceptance must still work');
  const evidence = await snapshot(BOB,id);
  expect(evidence.rsvp.active && !!evidence.rsvp.timestamp,'Offer acceptance must capture confirmation');
});
await test('existing event creation RPC and owner/team RSVP restriction still work', async () => {
  await asUser(OWNER);
  const created = (await query(`select public.create_event_with_details(gen_random_uuid(), jsonb_build_object(
    'title','[TEST] creation RPC','description','Local verification',
    'startTime',now()+interval '1 hour','endTime',now()+interval '2 hours',
    'capacity',5,'requiresApproval',false,'isOutdoor',false,
    'venue',jsonb_build_object('name','[TEST] venue','address','80 Stamford Road','postal','178902','lat',1.2974,'lng',103.8496),
    'backupVenue',null,'tags',jsonb_build_array('music'),'questions','[]'::jsonb)) as id`))[0].id;
  expect(!!created,'Event creation should return ID');
  await rejects("select public.register_for_event($1,'[]'::jsonb)",[created],/Organisers and helpers/);
});
await test('explicit interests remain usable by the existing waitlist scoring function', async () => {
  await asUser(OWNER);
  await query('insert into public.event_interests(event_id,interest_id) select $1,id from public.interests where slug=$2',[legacy,'music']);
  await denied('select * from public._registration_scores($1)',[legacy]);
  const score = (await query('select interest_match from public.event_registrations($1) where user_id=$2',[legacy,ALICE]))[0];
  expect(Number(score.interest_match)===1,'Existing waitlist interest match should reflect explicit selection');
});
await test('attendance is authoritative, duplicate staff scans are idempotent and checked-in users cannot cancel', async () => {
  await asUser(OWNER);
  const first = (await query("select * from public.staff_check_in($1,$2,'manual')",[legacy,legacyReg.id]))[0];
  const second = (await query("select * from public.staff_check_in($1,$2,'manual')",[legacy,legacyReg.id]))[0];
  expect(first.id===second.id,'Duplicate scan should return same check-in');
  expect((await snapshot(ALICE,legacy)).attendance.verified,'Unflagged authoritative check-in should count');
  await asUser(ALICE);
  await rejects('select public.cancel_registration($1)',[legacy],/already checked in/);
  await denied("insert into public.check_ins(event_id,registration_id,user_id,method) values ($1,$2,$3,'manual')",[legacy,legacyReg.id,ALICE]);
});
await test('flagged attendance stays excluded after review and authorised undo removes evidence', async () => {
  await admin();
  await query('update public.check_ins set fraud_flag=true where registration_id=$1',[legacyReg.id]);
  expect(!(await snapshot(ALICE,legacy)).attendance.verified,'Flagged attendance must be excluded');
  await asUser(OWNER); await query('update public.check_ins set fraud_reviewed=true where registration_id=$1',[legacyReg.id]);
  expect(!(await snapshot(ALICE,legacy)).attendance.verified,'Review alone must not clear fraud');
  await asUser(OWNER); await query('delete from public.check_ins where registration_id=$1',[legacyReg.id]);
  expect(!(await snapshot(ALICE,legacy)).attendance.verified,'Undo should remove attendance evidence');
});
await test('91-day-old saved and first-confirmed dates remain aged after real RPC reactivation', async () => {
  const id = await event('old evidence');
  await register(ALICE,id); await preference(ALICE,id,'save');
  await admin();
  await query("update public.user_event_preferences set saved_at=now()-interval '91 days', first_confirmed_at=now()-interval '91 days' where user_id=$1 and event_id=$2",[ALICE,id]);
  const original = await snapshot(ALICE,id);
  await preference(ALICE,id,'unsave'); await preference(ALICE,id,'save');
  await asUser(ALICE); await query('select public.cancel_registration($1)',[id]);
  await register(ALICE,id);
  const restored = await snapshot(ALICE,id);
  expect(restored.save.timestamp===original.save.timestamp && restored.rsvp.timestamp===original.rsvp.timestamp,'First dates changed');
  expect(calculateEventEvidence(restored,{now:Date.now()}).contribution===0,'Reactivated old evidence must contribute zero');
});
await test('rollback removal order is valid and transactional rollback restores the new objects', async () => {
  await admin();
  await db.exec(`begin;
    drop trigger capture_recommendation_first_confirmation on public.registrations;
    drop function public.capture_recommendation_first_confirmation();
    drop function public.set_recommendation_event_preference(uuid,text);
    drop function public.get_recommendation_event_evidence(uuid);
    drop function public.update_recommendation_profile(text,text,double precision,double precision,text[]);
    drop table public.user_event_preferences;
    rollback;`);
  expect((await snapshot(ALICE,legacy)).eventId===legacy,'Transactional rollback should preserve objects and data');
});
console.log(`RESULT ${passed} passed, ${failed} failed. Isolated PostgreSQL; hosted JWT/API/storage/concurrency not verified.`);
if(failed) process.exitCode=1;
} catch(error) {
  console.error('SETUP FAILED',error.code || '',error.message); process.exitCode=1;
} finally { await db.close(); }
