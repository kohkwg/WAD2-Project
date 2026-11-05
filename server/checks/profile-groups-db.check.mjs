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

const REQUEST = '20000000-0000-4000-8000-000000000001';

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

const overview = async () => (await q('select public.profile_groups_overview() as data'))[0].data;
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
  for (const file of ['recommendation-evidence-draft.sql', 'profile-username-draft.sql', 'profile-groups-draft.sql']) {
    await db.exec(await readFile(root + '/docs/sql/' + file, 'utf8'));
  }
  await q("insert into auth.users(id, email) values ($1,'owner@example.invalid'),($2,'alice@example.invalid'),($3,'bob@example.invalid')", [OWNER, ALICE, BOB]);
  await q("update public.profiles set username = case id when $1 then 'owner' when $2 then 'alice_1' else 'alicea1' end, display_name = 'Test person'", [OWNER, ALICE]);
  let groupId;
  await check('anonymous access denied for every group RPC', async () => {
    await asUser(null, 'anon');
    for (const sql of ['select public.profile_groups_overview()', `select public.profile_group_members('${REQUEST}')`, `select public.create_profile_group('Test', '${REQUEST}')`, "select public.search_group_people('ali')", `select public.invite_profile_group_member('${REQUEST}', '${ALICE}')`, `select public.respond_profile_group_invite('${REQUEST}', true)`]) await rejects(sql);
  });
  await check('creation validates names and request IDs and retries return one group', async () => {
    await asUser(OWNER);
    await rejects("select public.create_profile_group(' ', $1)", [REQUEST], '22023');
    await rejects("select public.create_profile_group('Test', null)", [], '22023');
    groupId = (await q("select public.create_profile_group('[TEST] Friends', $1) as id", [REQUEST]))[0].id;
    const retry = (await q("select public.create_profile_group('[TEST] Friends', $1) as id", [REQUEST]))[0].id;
    ok(groupId === retry, 'Retry duplicated group');
    const data = await overview();
    ok(data.groups.length === 1 && data.groups[0].isOwner, 'Owner should be member of one group');
  });
  await check('direct table reads and forged membership writes denied', async () => {
    for (const role of ['anon', 'authenticated']) {
      await asUser(role === 'anon' ? null : OWNER, role);
      await rejects('select * from public.profile_groups');
      await rejects('select * from public.profile_group_memberships');
      await rejects("insert into public.profile_group_memberships(group_id,user_id,status) values($1,$2,'accepted')", [groupId, BOB]);
      await rejects("update public.profile_groups set owner_id = $1 where id = $2", [BOB, groupId]);
    }
  });
  await check('username search is bounded, case normalised and exposes only public identity fields', async () => {
    await asUser(OWNER);
    await rejects("select public.search_group_people('al')", [], '22023');
    const rows = (await q("select public.search_group_people(' ALICE_ ') as data"))[0].data;
    ok(rows.length === 1 && rows[0].id === ALICE, 'Underscore must be literal');
    ok(Object.keys(rows[0]).sort().join(',') === 'displayName,id,username', 'Search leaked profile details');
    ok((await q("select public.search_group_people('owner') as data"))[0].data.length === 0, 'Search included caller');
  });
  await check('outsiders cannot inspect, invite or join a group without invitation', async () => {
    await asUser(BOB);
    ok((await overview()).groups.length === 0, 'Leaked unrelated group');
    await rejects('select public.profile_group_members($1)', [groupId]);
    await rejects('select public.invite_profile_group_member($1,$2)', [groupId, ALICE]);
    await rejects('select public.respond_profile_group_invite($1,true)', [groupId]);
  });
  await check('owner invite retries produce one invitation and no automatic membership', async () => {
    await asUser(OWNER);
    await q('select public.invite_profile_group_member($1,$2)', [groupId, ALICE]);
    await q('select public.invite_profile_group_member($1,$2)', [groupId, ALICE]);
    await asUser(ALICE);
    const data = await overview();
    ok(data.groups.length === 0 && data.invitations.length === 1, 'Invitation became membership');
    await rejects('select public.profile_group_members($1)', [groupId]);
  });
  await check('decline is retry-safe and does not give group access', async () => {
    await q('select public.respond_profile_group_invite($1,false)', [groupId]);
    await q('select public.respond_profile_group_invite($1,false)', [groupId]);
    const data = await overview();
    ok(!data.groups.length && !data.invitations.length, 'Declined invitation remains visible');
    await rejects('select public.profile_group_members($1)', [groupId]);
  });
  await check('reinvite and explicit acceptance grants member access; accepted members cannot invite', async () => {
    await asUser(OWNER);
    await q('select public.invite_profile_group_member($1,$2)', [groupId, ALICE]);
    await asUser(ALICE);
    await q('select public.respond_profile_group_invite($1,true)', [groupId]);
    await q('select public.respond_profile_group_invite($1,true)', [groupId]);
    const data = await overview();
    ok(data.groups.length === 1 && !data.groups[0].isOwner && !data.invitations.length, 'Acceptance not recorded');
    const members = (await q('select public.profile_group_members($1) as data', [groupId]))[0].data;
    ok(members.length === 2 && members.filter(m => m.isOwner).length === 1, 'Incorrect member list');
    await rejects('select public.invite_profile_group_member($1,$2)', [groupId, BOB]);
    await rejects('select public.respond_profile_group_invite($1,false)', [groupId]);
  });
  await check('repeated invite cannot downgrade accepted member and responses cannot forge another user', async () => {
    await asUser(OWNER);
    await q('select public.invite_profile_group_member($1,$2)', [groupId, ALICE]);
    await asUser(BOB);
    await rejects('select public.respond_profile_group_invite($1,true)', [groupId]);
    await asUser(ALICE);
    ok((await overview()).groups.length === 1, 'Existing member was demoted');
  });
  console.log(`${passed} isolated group database checks passed; hosted JWT/concurrency unverified.`);
} finally {
  await db.close();
}
