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
const overview = async () => (await q('select public.profile_friends_overview() as data'))[0].data
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

for (const file of ['recommendation-evidence-draft.sql', 'profile-username-draft.sql', 'profile-friends-draft.sql']) {
  await db.exec(await readFile(root + '/docs/sql/' + file, 'utf8'))
}
await q("insert into auth.users(id, email) values ($1,'owner@example.invalid'),($2,'alice@example.invalid'),($3,'bob@example.invalid')", [OWNER, ALICE, BOB])
await q("update public.profiles set username = case id when $1 then 'owner' when $2 then 'alice_1' else 'alicea1' end, display_name = 'Test person'", [OWNER, ALICE])

await check('anonymous RPC access and direct friendship table access are denied', async () => {
  await asUser(null, 'anon')
  await rejects('select public.profile_friends_overview()')
  await rejects("select public.search_profile_friends('ali')")
  await rejects('select public.send_profile_friend_request($1)', [ALICE])
  await rejects('select public.respond_profile_friend_request($1,true)', [ALICE])
  await asUser(OWNER)
  await rejects('select * from public.profile_friendships')
  await rejects("insert into public.profile_friendships(user_low,user_high,requester_id,status) values($1,$2,$1,'accepted')", [OWNER,ALICE])
})
await check('search excludes self, validates prefix and exposes only identity and relationship', async () => {
  await rejects("select public.search_profile_friends('al')", [], '22023')
  const data = (await q("select public.search_profile_friends('ALICE_') as data"))[0].data
  ok(data.length === 1 && data[0].id === ALICE, 'Literal prefix matching failed')
  ok(Object.keys(data[0]).sort().join(',') === 'displayName,id,relationship,username', 'Unexpected fields exposed')
  ok((await q("select public.search_profile_friends('owner') as data"))[0].data.length === 0, 'Search returned caller')
  await rejects('select public.send_profile_friend_request($1)', [OWNER], '22023')
})
await check('send retries produce one pending request, not friendship', async () => {
  await q('select public.send_profile_friend_request($1)', [ALICE])
  await q('select public.send_profile_friend_request($1)', [ALICE])
  const sent = await overview()
  ok(sent.outgoing.length === 1 && !sent.friends.length, 'Send created duplicate or accepted friendship')
  await asUser(ALICE)
  const received = await overview()
  ok(received.incoming.length === 1 && !received.friends.length, 'Recipient was automatically friended')
})
await check('opposite request requires explicit acceptance; sender and outsider cannot accept', async () => {
  await rejects('select public.send_profile_friend_request($1)', [OWNER], '22023')
  await asUser(OWNER)
  await rejects('select public.respond_profile_friend_request($1,true)', [ALICE])
  await asUser(BOB)
  await rejects('select public.respond_profile_friend_request($1,true)', [OWNER])
  const data = await overview()
  ok(!data.friends.length && !data.incoming.length && !data.outgoing.length, 'Unrelated account sees request')
})
await check('decline retries are safe; sender can send a fresh request after decline', async () => {
  await asUser(ALICE)
  await q('select public.respond_profile_friend_request($1,false)', [OWNER])
  await q('select public.respond_profile_friend_request($1,false)', [OWNER])
  ok(!(await overview()).incoming.length, 'Declined request remains incoming')
  await asUser(OWNER)
  ok(!(await overview()).outgoing.length, 'Declined request remains outgoing')
  await q('select public.send_profile_friend_request($1)', [ALICE])
})
await check('accept is mutual, retry-safe and cannot be downgraded by sends or decline', async () => {
  await asUser(ALICE)
  await q('select public.respond_profile_friend_request($1,true)', [OWNER])
  await q('select public.respond_profile_friend_request($1,true)', [OWNER])
  ok((await overview()).friends.length === 1, 'Recipient missing friend')
  await rejects('select public.respond_profile_friend_request($1,false)', [OWNER])
  await asUser(OWNER)
  await q('select public.send_profile_friend_request($1)', [ALICE])
  const data = await overview()
  ok(data.friends.length === 1 && !data.outgoing.length, 'Friendship was downgraded')
  const search = (await q("select public.search_profile_friends('alice_') as data"))[0].data
  ok(search[0].relationship === 'friends', 'Search relationship wrong')
})
console.log(`${passed} isolated friends database checks passed; hosted concurrency/JWT unverified.`)
} finally { await db.close() }
