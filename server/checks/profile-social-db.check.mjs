// Isolated in-memory PostgreSQL only; never reads .env or connects to hosted services.
// Pass a temporary PGlite module path; no application dependency is needed.
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
if (!process.argv[2]) throw new Error('Pass the temporary PGlite runtime module path')
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const OWNER = '10000000-0000-4000-8000-000000000001'
const ALICE = '10000000-0000-4000-8000-000000000002'
const BOB = '10000000-0000-4000-8000-000000000003'
const REQUEST = '20000000-0000-4000-8000-000000000001'
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const ok = (condition, message) => { if (!condition) throw new Error(message) }
async function asUser(id, role = 'authenticated') {
  await db.exec('reset role')
  await q("select set_config('request.jwt.claim.sub', $1, false)", [id || ''])
  await db.exec(`set role ${role}`)
}
async function rejects(sql, args = [], code = '42501') {
  try { await q(sql, args) } catch (e) { ok(e.code === code, `Expected ${code}, got ${e.code}: ${e.message}`); return }
  throw new Error('Expected rejection: ' + sql)
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS', name) }
const overview = async () => (await q('select public.profile_groups_overview() as data'))[0].data
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

for (const file of ['recommendation-evidence-draft.sql', 'profile-username-draft.sql', 'profile-groups-draft.sql', 'profile-friends-draft.sql', 'profile-social-realtime-draft.sql']) {
  await db.exec(await readFile(root + '/docs/sql/' + file, 'utf8'))
}
await q("insert into auth.users(id, email) values ($1,'owner@example.invalid'),($2,'alice@example.invalid'),($3,'bob@example.invalid')", [OWNER, ALICE, BOB])
await q("update public.profiles set username = case id when $1 then 'owner' when $2 then 'alice_1' else 'alicea1' end, display_name = 'Test person'", [OWNER, ALICE])

async function revision(id) { return Number((await q('select revision from public.profile_social_updates where user_id=$1',[id]))[0]?.revision || 0) }
await check('signals are selectable only by their owner; clients cannot write or invoke internal notifier', async () => {
  await asUser(OWNER)
  ok((await q('select * from public.profile_social_updates')).length === 1, 'Other accounts signals leaked')
  ok((await q('select * from public.profile_social_updates where user_id=$1',[ALICE])).length === 0,'Other signal accessible')
  await rejects('update public.profile_social_updates set revision=0')
  await rejects('select public.touch_profile_social_users(array[$1]::uuid[])',[ALICE])
  await rejects('select * from public.profile_friendships')
  await rejects('select * from public.profile_group_memberships')
  await asUser(null,'anon')
  await rejects('select * from public.profile_social_updates')
})
await check('friend request and acceptance signal both accounts without notifying outsiders', async () => {
  await db.exec('reset role')
  const before = [await revision(OWNER),await revision(ALICE),await revision(BOB)]
  await asUser(OWNER); await q('select public.send_profile_friend_request($1)',[ALICE])
  await db.exec('reset role')
  ok(await revision(OWNER)>before[0] && await revision(ALICE)>before[1], 'Friend request missed a participant')
  ok(await revision(BOB)===before[2], 'Friend request signalled outsider')
  const prior = await revision(OWNER)
  await asUser(ALICE); await q('select public.respond_profile_friend_request($1,true)',[OWNER])
  await db.exec('reset role'); ok(await revision(OWNER)>prior,'Acceptance missed sender')
})
let groupId
await check('group creation, invitation and acceptance signal host and relevant members', async () => {
  await asUser(OWNER)
  groupId=(await q("select public.create_profile_group('[TEST] Realtime', $1) as id",[REQUEST]))[0].id
  await db.exec('reset role'); const before = [await revision(OWNER),await revision(BOB)]
  await asUser(OWNER); await q('select public.invite_profile_group_member($1,$2)',[groupId,BOB])
  await db.exec('reset role'); ok(await revision(OWNER)>before[0] && await revision(BOB)>before[1],'Group invite did not signal both')
  const prior=await revision(OWNER)
  await asUser(BOB); await q('select public.respond_profile_group_invite($1,true)',[groupId])
  await db.exec('reset role'); ok(await revision(OWNER)>prior,'Group acceptance missed owner')
})
await check('identity edits notify existing friend and group peers', async () => {
  await db.exec('reset role'); const a=await revision(ALICE), b=await revision(BOB)
  await asUser(OWNER); await q("update public.profiles set display_name='[TEST] New name' where id=$1",[OWNER])
  await db.exec('reset role'); ok(await revision(ALICE)>a && await revision(BOB)>b,'Identity change missed social peers')
})
await check('rolled back changes also roll back their signals', async () => {
  await db.exec('reset role'); const before=await revision(ALICE)
  await db.exec('begin')
  await q("update public.profiles set display_name='[TEST] Rolled back' where id=$1",[OWNER])
  ok(await revision(ALICE)>before,'Trigger did not execute inside transaction')
  await db.exec('rollback')
  ok(await revision(ALICE)===before,'Rolled-back change left a signal')
})
await check('Realtime publication contains safe signals but not private social tables', async () => {
  const tables=(await q("select tablename from pg_publication_tables where pubname='supabase_realtime'")).map(r=>r.tablename)
  ok(tables.includes('profile_social_updates'),'Signal not published')
  ok(!tables.includes('profile_friendships') && !tables.includes('profile_groups') && !tables.includes('profile_group_memberships'),'Private table published')
})
console.log(`${passed} isolated social signal checks passed; actual Realtime WebSockets/JWT are unverified.`)
} finally { await db.close() }
