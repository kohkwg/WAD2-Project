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
  for (const file of ['recommendation-evidence-draft.sql', 'profile-username-draft.sql', 'event-team-invitations-draft.sql']) {
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
  await check('only owner may search/invite; lookup returns minimal identity', async () => {
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
    await rejects("select public.invite_event_team_member($1,$2,'organiser')", [eventId, ALICE], '22023');
    const team = (await q('select public.event_team_workspace($1) as data', [eventId]))[0].data;
    ok(team.members.length === 1 && team.pending.length === 1, 'Duplicate invite or premature membership');
    await asUser(ALICE);
    ok((await inbox()).invitations.length === 1, 'Recipient missing invitation');
    ok(!(await q('select public.is_event_staff($1) as staff', [eventId]))[0].staff, 'Invite granted staff access');
    await rejects('select public.event_team_workspace($1)', [eventId]);
    await asUser(BOB);
    await rejects('select public.respond_event_team_invitation($1,true)', [eventId]);
  });
  await check('acceptance creates real helper membership and is retry-safe', async () => {
    await asUser(ALICE);
    await q('select public.respond_event_team_invitation($1,true)', [eventId]);
    await q('select public.respond_event_team_invitation($1,true)', [eventId]);
    const flags = (await q('select public.is_event_staff($1) as staff, public.is_event_organiser($1) as organiser', [eventId]))[0];
    ok(flags.staff && !flags.organiser, 'Helper role wrong');
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
    await rejects("select public.invite_event_team_member($1,$2,'helper')", [eventId, ALICE]);
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
  await check('team roles do not grant owner-only Feature 4 operations', async () => {
    await db.exec('reset role');
    await q("insert into public.tasks(event_id,title,created_by) values($1,'[TEST] Private task',$2)", [eventId, OWNER]);
    await asUser(OWNER);
    ok((await q('select * from public.tasks where event_id=$1', [eventId])).length === 1, 'Private fixture missing');
    await asUser(BOB);
    // owner-only policies on tasks remain the deployed feature 4 contract.
    const rows = await q('select * from public.tasks where event_id=$1', [eventId]);
    ok(rows.length === 0, 'Unexpected private task visibility');
    await rejects("select public.create_feature4_task($1,gen_random_uuid(),'[TEST] Forged task','')", [eventId], 'P0001');
    await db.exec('reset role');
    const owner = (await q('select organiser_id from public.events where id=$1', [eventId]))[0].organiser_id;
    ok(owner === OWNER, 'Invitation transferred ownership');
  });
  console.log(`${passed} isolated event-team checks passed; hosted JWT/concurrency unverified.`);
} finally {
  await db.close();
}
