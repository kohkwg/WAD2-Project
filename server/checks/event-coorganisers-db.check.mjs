// isolated in-memory postgresql only; never reads .env or connects to hosted services.
// pass a temporary pglite module path; no application dependency is needed.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the temporary PGlite runtime module path');

const {
  PGlite
} = await import(pathToFileURL(process.argv[2]).href);

const db = new PGlite();

const OWNER = '10000000-0000-4000-8000-000000000001';

const ALICE = '10000000-0000-4000-8000-000000000002';

const BOB = '10000000-0000-4000-8000-000000000003';

const q = async (sql, args = []) => (await db.query(sql, args)).rows;

const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function asUser(id, role = 'authenticated') {
  await db.exec('reset role');
  await q("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}

async function rejects(sql, args = [], code = '42501') {
  try {
    await q(sql, args);
  } catch (e) {
    ok(e.code === code, `Expected ${code}, got ${e.code}: ${e.message}`);
    return;
  }
  throw new Error('Expected rejection: ' + sql);
}

let passed = 0;

async function check(name, run) {
  await run();
  passed++;
  console.log('PASS', name);
}

const inbox = async () => (await q('select public.my_event_teams() as data'))[0].data;
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

  // only unsupported platform scheduling extension loading is substituted.
  // all repository application migrations, functions, triggers and policies run.
  for (const name of (await readdir(root + '/supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) {
    const sql = (await readFile(root + '/supabase/migrations/' + name, 'utf8')).replace('create extension if not exists pg_cron;', '-- local scheduling substitute');
    await db.exec(sql);
  }
  for (const file of ['recommendation-evidence-draft.sql', 'profile-username-draft.sql', 'event-team-invitations-draft.sql', 'event-coorganisers-draft.sql', 'event-team-creators-draft.sql']) {
    await db.exec(await readFile(root + '/docs/sql/' + file, 'utf8'));
  }
  await q("insert into auth.users(id, email) values ($1,'owner@example.invalid'),($2,'alice@example.invalid'),($3,'bob@example.invalid')", [OWNER, ALICE, BOB]);
  await q("update public.profiles set username = case id when $1 then 'owner' when $2 then 'alice_1' else 'alicea1' end, display_name = 'Test person'", [OWNER, ALICE]);
  await asUser(OWNER);
  const eventId = (await q("insert into public.events(title,status,starts_at,ends_at) values('[TEST] Team','published',now()+interval '2 days',now()+interval '2 days 2 hours') returning id"))[0].id;
  await check('anonymous RPC calls and direct invitation table access are denied', async () => {
    await asUser(null, 'anon');
    for (const sql of ['select public.my_event_teams()', `select public.event_team_workspace('${eventId}')`, `select public.search_event_team_people('${eventId}','ali')`, `select public.invite_event_team_member('${eventId}','${ALICE}','helper')`, `select public.respond_event_team_invitation('${eventId}',true)`]) await rejects(sql);
    await asUser(OWNER);
    await rejects('select * from public.event_team_invitations');
    await rejects("insert into public.event_team_invitations(event_id,user_id,invited_by,member_role) values($1,$2,$3,'organiser')", [eventId, ALICE, OWNER]);
  });
  await check('unrelated users cannot search/invite; lookup returns minimal identity', async () => {
    const rows = (await q("select public.search_event_team_people($1,'ALICE_') as data", [eventId]))[0].data;
    ok(rows.length === 1 && rows[0].id === ALICE, 'Username match failed');
    ok(Object.keys(rows[0]).sort().join(',') === 'displayName,id,username', 'Lookup exposed private data');
    await asUser(BOB);
    await rejects("select public.search_event_team_people($1,'ali')", [eventId]);
    await rejects("select public.invite_event_team_member($1,$2,'helper')", [eventId, ALICE]);
  });
  await check('invite retries do not grant membership before recipient accepts', async () => {
    await asUser(OWNER);
    await q("select public.invite_event_team_member($1,$2,'helper')", [eventId, ALICE]);
    await q("select public.invite_event_team_member($1,$2,'helper')", [eventId, ALICE]);
    await q("select public.invite_event_team_member($1,$2,'organiser')", [eventId, ALICE]);
    const team = (await q('select public.event_team_workspace($1) as data', [eventId]))[0].data;
    ok(team.members.length === 1 && team.pending.length === 1, 'Duplicate invite or premature membership');
    await asUser(ALICE);
    ok((await inbox()).invitations.length === 1, 'Recipient missing invitation');
    ok(!(await q('select public.is_event_staff($1) as staff', [eventId]))[0].staff, 'Invite granted staff access');
    await rejects('select public.event_team_workspace($1)', [eventId]);
    await asUser(BOB);
    await rejects('select public.respond_event_team_invitation($1,true)', [eventId]);
  });
  await check('acceptance always creates co-organiser membership and is retry-safe', async () => {
    await asUser(ALICE);
    await q('select public.respond_event_team_invitation($1,true)', [eventId]);
    await q('select public.respond_event_team_invitation($1,true)', [eventId]);
    const flags = (await q('select public.is_event_staff($1) as staff, public.is_event_organiser($1) as organiser', [eventId]))[0];
    ok(flags.staff && flags.organiser, 'Co-organiser role wrong');
    const data = await inbox();
    ok(!data.invitations.length && data.teams.length === 1, 'Accepted team not listed');
    const team = (await q('select public.event_team_workspace($1) as data', [eventId]))[0].data;
    ok(team.members.length === 2 && !team.isOwner && !team.pending.length, 'Helper roster access wrong');
  });
  await check('decline grants no access, reinvite and acceptance create organiser permission', async () => {
    await asUser(OWNER);
    await q("select public.invite_event_team_member($1,$2,'organiser')", [eventId, BOB]);
    await asUser(BOB);
    await q('select public.respond_event_team_invitation($1,false)', [eventId]);
    await q('select public.respond_event_team_invitation($1,false)', [eventId]);
    ok(!(await q('select public.is_event_staff($1) as staff', [eventId]))[0].staff, 'Decline granted membership');
    await asUser(OWNER);
    await q("select public.invite_event_team_member($1,$2,'organiser')", [eventId, BOB]);
    await asUser(BOB);
    await q('select public.respond_event_team_invitation($1,true)', [eventId]);
    ok((await q('select public.is_event_organiser($1) as organiser', [eventId]))[0].organiser, 'Co-organiser did not get existing organiser role');
    await q("select public.invite_event_team_member($1,$2,'helper')", [eventId, ALICE]);
  });
  await check('active attendees must cancel before joining; failed acceptance retains invitation', async () => {
    await asUser(OWNER);
    const event2 = (await q("insert into public.events(title,status,starts_at,ends_at) values('[TEST] Attendee','published',now()+interval '3 days',now()+interval '3 days 2 hours') returning id"))[0].id;
    await asUser(ALICE);
    await q("select * from public.register_for_event($1,'[]'::jsonb)", [event2]);
    await asUser(OWNER);
    await q("select public.invite_event_team_member($1,$2,'helper')", [event2, ALICE]);
    await asUser(ALICE);
    await rejects('select public.respond_event_team_invitation($1,true)', [event2], '22023');
    ok((await inbox()).invitations.length === 1, 'Failed acceptance lost invitation');
    await q('select public.cancel_registration($1)', [event2]);
    await q('select public.respond_event_team_invitation($1,true)', [event2]);
  });
  await check('creator identity is minimal and restricted to accepted organisers', async () => {
    await db.exec('reset role');
    await q("update auth.users set raw_user_meta_data=jsonb_build_object('dino','cheer','private_note','secret') where id=$1", [OWNER]);
    await asUser(ALICE);
    const creators = (await q('select public.event_team_creators(array[$1::uuid]) as data', [eventId]))[0].data;
    ok(creators.length === 1 && creators[0].username === 'owner' && creators[0].dino === 'cheer', 'Creator identity missing');
    ok(Object.keys(creators[0]).sort().join(',') === 'dino,displayName,eventId,username', 'Creator RPC exposed unrelated fields');
    await asUser(null, 'anon');
    await rejects('select public.event_team_creators(array[$1::uuid])', [eventId]);
  });
  await check('co-organisers share operations, invitations, team management and deletion', async () => {
    await asUser(ALICE);
    await q("select public.create_feature4_task($1,gen_random_uuid(),'[TEST] Shared task','')", [eventId]);
    ok((await q('select * from public.tasks where event_id=$1', [eventId])).length === 1, 'Co-organiser cannot read task');
    await q('select public.set_feature4_budget_limit($1,100)', [eventId]);
    await q("select public.set_feature4_forecast_area($1,'City')", [eventId]);
    await q("select public.add_feature4_budget_category($1,'Shared category')", [eventId]);
    await q("insert into public.announcements(event_id,title,body,author_id) values($1,'[TEST] Shared','[TEST] Shared announcement',$2)", [eventId, ALICE]);
    const task = (await q('select id from public.tasks where event_id=$1', [eventId]))[0].id;
    await q('select public.save_feature4_task_board($1,$2::jsonb)', [eventId, JSON.stringify({
      todo: [],
      in_progress: [task],
      done: []
    })]);
    await q("insert into public.budget_items(event_id,description,category,estimated_amount,actual_amount) values($1,'[TEST] Shared expense','Shared category',20,10)", [eventId]);
    await q("update public.budget_items set actual_amount=15 where event_id=$1", [eventId]);
    ok((await q('select actual_amount from public.budget_items where event_id=$1', [eventId]))[0].actual_amount === '15.00', 'Co-organiser budget update failed');
    await q("update public.announcements set body='[TEST] Updated' where event_id=$1", [eventId]);
    ok((await q('select body from public.announcements where event_id=$1', [eventId]))[0].body === '[TEST] Updated', 'Announcement edit failed');
    ok(!(await q("select has_function_privilege('authenticated','public.commit_trusted_venue_switch(uuid,uuid,jsonb)','EXECUTE') as allowed"))[0].allowed, 'Browser may call trusted commit');
    await q('update public.events set organiser_id=$2 where id=$1', [eventId, ALICE]);
    ok((await q('select organiser_id from public.events where id=$1', [eventId]))[0].organiser_id === OWNER, 'Ownership changed');
    await q("select public.invite_event_team_member($1,$2,'organiser')", [eventId, BOB]);
    await q("select public.add_event_member_by_email($1,'bob@example.invalid')", [eventId]);
    ok((await q('delete from public.event_members where event_id=$1 and user_id=$2 returning user_id', [eventId, BOB])).length === 1, 'Co-organiser cannot manage membership');
    await q("update public.events set description='[TEST] Shared details' where id=$1", [eventId]);
    const removable = (await q("insert into public.events(title,status,starts_at,ends_at) values('[TEST] Delete shared','published',now()+interval '4 days',now()+interval '4 days 2 hours') returning id"))[0].id;
    await q("select public.invite_event_team_member($1,$2,'organiser')", [removable, OWNER]);
    await asUser(OWNER);
    await q('select public.respond_event_team_invitation($1,true)', [removable]);
    ok((await q('delete from public.events where id=$1 returning id', [removable])).length === 1, 'Co-organiser cannot delete shared event');
  });
  await check('unrelated users remain blocked; original owner retains delete', async () => {
    await db.exec('reset role');
    const outsider = '10000000-0000-4000-8000-000000000004';
    await q("insert into auth.users(id,email) values($1,'outsider@example.invalid')", [outsider]);
    await asUser(outsider);
    ok((await q('select public.event_team_creators(array[$1::uuid]) as data', [eventId]))[0].data.length === 0, 'Creator leaked to unrelated user');
    ok((await q('select * from public.tasks where event_id=$1', [eventId])).length === 0, 'Private task leaked');
    await rejects("select public.create_feature4_task($1,gen_random_uuid(),'Forbidden','')", [eventId], 'P0001');
    await asUser(OWNER);
    ok((await q('delete from public.events where id=$1 returning id', [eventId])).length === 1, 'Owner cannot delete');
  });
  console.log(`${passed} isolated event-team checks passed; hosted JWT/concurrency unverified.`);
} finally {
  await db.close();
}
