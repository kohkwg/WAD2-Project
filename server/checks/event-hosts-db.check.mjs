// Isolated PostgreSQL verification of supabase/migrations/20261105180000_event_hosts.sql.
// Never reads .env or uses a database URL. Pass the path to a temporary PGlite runtime module;
// no application dependency is added. Usage:
//   node server/checks/event-hosts-db.check.mjs <tmp>/node_modules/@electric-sql/pglite/dist/index.js
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the local path to the PGlite runtime module');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const MIGRATION = '20261105180000_event_hosts.sql';
let passed = 0, failed = 0;
function expect(value, message) { if (!value) throw new Error(message); }
async function test(name, run) {
  try { await run(); passed++; console.log('PASS', name); }
  catch (error) { failed++; console.log('FAIL', name, error.code || '', error.message); }
}
async function query(sql, params = []) { return (await db.query(sql, params)).rows; }
const OWNER = '30000000-0000-4000-8000-000000000001';
const AMY = '30000000-0000-4000-8000-000000000002';
const BEN = '30000000-0000-4000-8000-000000000003';
async function asUser(id, role = 'authenticated') {
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}
async function admin() { await db.exec('reset role'); }
const hours = (n) => new Date(Date.now() + n * 3600e3).toISOString();
const venue = { name: 'SMU Campus Green', address: '81 Victoria Street', postal: '188065', lat: 1.2966, lng: 103.8502 };
const basePayload = (extra = {}) => ({
  title: '[TEST] Online check', description: '', startTime: hours(48), endTime: hours(50), capacity: 1,
  requiresApproval: false, isOutdoor: false, venue, backupVenue: null, tags: ['others'], questions: [], ...extra,
});
const create = async (payload) => (await query('select public.create_event_with_details(gen_random_uuid(), $1::jsonb) as id', [JSON.stringify(payload)]))[0].id;

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

const migrations = (await readdir(root + '/supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
expect(migrations.includes(MIGRATION), 'the migration under test exists');
for (const name of migrations) await db.exec((await readFile(root + '/supabase/migrations/' + name, 'utf8')).replace('create extension if not exists pg_cron;', '-- local scheduling substitute'));
console.log(`Loaded all ${migrations.length} migrations; auth/storage/cron are local platform substitutes.`);

const HELPER = '30000000-0000-4000-8000-000000000004';
await query(`insert into auth.users(id,email) values ($1,'owner@example.invalid'),($2,'amy@example.invalid'),($3,'ben@example.invalid'),($4,'hal@example.invalid')`, [OWNER, AMY, BEN, HELPER]);
await query(`insert into public.profiles(id) values ($1),($2),($3),($4) on conflict (id) do nothing`, [OWNER, AMY, BEN, HELPER]);
await query(`update public.profiles set display_name = 'Olive Owner', username = 'olive', bio = 'Runs the club', postal_code = '188065', lat = 1.3, lng = 103.8 where id = $1`, [OWNER]);
await query(`update public.profiles set display_name = 'Amy Co', username = 'amy' where id = $1`, [AMY]);
await query(`update auth.users set raw_user_meta_data = '{"dino":"berry"}' where id = $1`, [OWNER]);
await query(`update public.profiles set display_name = 'Hal Helper', username = 'hal' where id = $1`, [HELPER]);
await asUser(OWNER);
const published = await create(basePayload({ title: '[TEST] Hosts' }));
await admin();
const draft = (await query(`insert into public.events(organiser_id,title,status,starts_at,ends_at,capacity) values ($1,'[TEST] Draft','draft',now()+interval '3 days',now()+interval '3 days 2 hours',20) returning id`, [OWNER]))[0].id;
await query(`insert into public.event_members(event_id,user_id,member_role) values ($1,$2,'organiser') on conflict do nothing`, [published, AMY]);
await query(`insert into public.event_members(event_id,user_id,member_role) values ($1,$2,'helper')`, [published, HELPER]);
const hosts = async (id) => (await query('select public.event_hosts($1) as h', [id]))[0].h;

await test('a logged-out visitor sees the organiser first, then co-organisers', async () => {
  await asUser(null, 'anon');
  const list = await hosts(published);
  expect(list.length === 2, `expected 2 hosts, got ${JSON.stringify(list)}`);
  expect(list[0].id === OWNER && list[0].role === 'organiser' && list[0].name === 'Olive Owner' && list[0].username === 'olive' && list[0].bio === 'Runs the club', 'organiser first with public fields');
  expect(list[1].id === AMY && list[1].role === 'co-organiser', 'co-organiser second');
  expect(list[0].dino === 'berry' && list[1].dino === null, 'chosen dino comes through, null when none');
});
await test('only public profile fields come back (no postcode or location)', async () => {
  await asUser(BEN);
  const [owner] = await hosts(published);
  expect(JSON.stringify(Object.keys(owner).sort()) === JSON.stringify(['avatarKey', 'bio', 'dino', 'id', 'name', 'role', 'username']), `keys: ${Object.keys(owner)}`);
});
await test('helpers are not listed as hosts', async () => {
  await admin();
  expect((await query(`select 1 from public.event_members where event_id = $1 and user_id = $2 and member_role = 'helper'`, [published, HELPER])).length === 1, 'helper row exists');
  await asUser(BEN);
  expect(!(await hosts(published)).some(h => h.id === HELPER), 'helper hidden');
});
await test('a draft is hidden from others but shown to its organiser', async () => {
  await asUser(BEN);
  expect((await hosts(draft)).length === 0, 'draft hidden from another user');
  await asUser(null, 'anon');
  expect((await hosts(draft)).length === 0, 'draft hidden from logged-out visitors');
  await asUser(OWNER);
  expect((await hosts(draft)).length === 1, 'organiser sees own draft hosts');
});
await test('an unknown event returns an empty list', async () => {
  await asUser(BEN);
  expect((await hosts('30000000-0000-4000-8000-0000000000ff')).length === 0, 'empty');
});
} catch (error) { failed++; console.log('FAIL setup', error.code || '', error.message); }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
