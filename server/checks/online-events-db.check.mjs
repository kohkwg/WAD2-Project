// Isolated PostgreSQL verification of supabase/migrations/20261105120000_online_events_hidden_capacity.sql.
// Never reads .env or uses a database URL. Pass the path to a temporary PGlite runtime module;
// no application dependency is added. Usage:
//   node server/checks/online-events-db.check.mjs <tmp>/node_modules/@electric-sql/pglite/dist/index.js
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the local path to the PGlite runtime module');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const MIGRATION = '20261105120000_online_events_hidden_capacity.sql';
let passed = 0, failed = 0;
function expect(value, message) { if (!value) throw new Error(message); }
async function test(name, run) {
  try { await run(); passed++; console.log('PASS', name); }
  catch (error) { failed++; console.log('FAIL', name, error.code || '', error.message); }
}
async function query(sql, params = []) { return (await db.query(sql, params)).rows; }
async function rejects(sql, params, pattern) {
  try { await query(sql, params); }
  catch (error) { expect(pattern.test(error.message), `Unexpected rejection: ${error.message}`); return; }
  throw new Error('Expected SQL rejection');
}
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
const online = (link, extra = {}) => basePayload({ isOnline: true, venue: null, onlineLink: link, ...extra });
const create = async (payload) => (await query('select public.create_event_with_details(gen_random_uuid(), $1::jsonb) as id', [JSON.stringify(payload)]))[0].id;
const access = async (id) => (await query('select public.event_online_access($1) as a', [id]))[0].a;

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
let legacyId;
for (const name of migrations) {
  // An event saved before this migration, to check existing rows keep one consistent shape
  if (name === MIGRATION) {
    await query(`insert into auth.users(id,email) values ($1,'owner@example.invalid'),($2,'amy@example.invalid'),($3,'ben@example.invalid')`, [OWNER, AMY, BEN]);
    await asUser(OWNER);
    legacyId = (await query(`insert into public.events(title,status,starts_at,ends_at,capacity) values ('[TEST] Older event','published',now()+interval '3 days',now()+interval '3 days 2 hours',20) returning id`))[0].id;
    await admin();
  }
  await db.exec((await readFile(root + '/supabase/migrations/' + name, 'utf8')).replace('create extension if not exists pg_cron;', '-- local scheduling substitute'));
}
console.log(`Loaded all ${migrations.length} migrations; auth/storage/cron are local platform substitutes.`);
let linked, physical;

await test('existing events become physical with capacity shown, and "Others" is a tag', async () => {
  const row = (await query('select is_online, hide_capacity from public.events where id = $1', [legacyId]))[0];
  expect(row.is_online === false && row.hide_capacity === false, 'legacy row defaults');
  expect((await query("select name from public.interests where slug = 'others'"))[0]?.name === 'Others', 'others interest');
});

await test('creation without the new keys still makes a physical event; with them it stores the choices', async () => {
  await asUser(OWNER);
  physical = await create(basePayload());
  const a = (await query('select is_online, hide_capacity, venue_id from public.events where id = $1', [physical]))[0];
  expect(!a.is_online && !a.hide_capacity && a.venue_id, 'older payload shape');
  const hidden = await create(basePayload({ hideCapacity: true, isOnline: false, onlineLink: null }));
  expect((await query('select hide_capacity from public.events where id = $1', [hidden]))[0].hide_capacity === true, 'hide capacity stored');
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)', [JSON.stringify(basePayload({ surprise: true }))], /invalid shape/);
});

await test('online events keep no venue and an optional private link', async () => {
  await asUser(OWNER);
  const noLink = await create(online(null));
  const row = (await query('select is_online, venue_id, backup_venue_id from public.events where id = $1', [noLink]))[0];
  expect(row.is_online && row.venue_id === null && row.backup_venue_id === null, 'no venue rows');
  await admin();
  expect((await query('select 1 from public.event_created_venues where original_event_id = $1', [noLink])).length === 0, 'no venue provenance');
  await asUser(OWNER);
  linked = await create(online({ url: 'https://zoom.us/j/123?pwd=abc', revealAt: hours(47) }));
  expect((await query('select url from public.event_online_links where event_id = $1', [linked]))[0].url === 'https://zoom.us/j/123?pwd=abc', 'link stored');
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)', [JSON.stringify(online(null, { venue }))], /no venue/);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)', [JSON.stringify(online({ url: 'http://zoom.us/j/1', revealAt: hours(47) }))], /https/);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)', [JSON.stringify(online({ url: 'https://user:pw@zoom.us/j/1', revealAt: hours(47) }))], /https/);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)', [JSON.stringify(online({ url: 'https://zoom.us/j/1', revealAt: hours(51) }))], /before the event ends/);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)', [JSON.stringify(basePayload({ onlineLink: { url: 'https://zoom.us/j/1', revealAt: hours(47) } }))], /Only online events/);
  await admin();
  await rejects('update public.events set venue_id = (select venue_id from public.events where id = $2) where id = $1', [noLink, physical], /events_online_has_no_venue/);
});

await test('only the organiser reads or writes the link table directly', async () => {
  await asUser(AMY);
  expect((await query('select * from public.event_online_links')).length === 0, 'Amy reads nothing');
  await rejects('insert into public.event_online_links(event_id, url, reveal_at) values ($1, $2, now())', [linked, 'https://evil.example/x'], /row-level security/);
  await asUser(null, 'anon');
  await rejects('select * from public.event_online_links', [], /permission denied/);
  await asUser(OWNER);
  expect((await query('select * from public.event_online_links where event_id = $1', [linked])).length === 1, 'owner reads it');
  await rejects('insert into public.event_online_links(event_id, url, reveal_at) values ($1, $2, now())', [physical, 'https://zoom.us/j/9'], /Only online events/);
});

await test('the link opens for confirmed attendees once its time comes, and for the organiser always', async () => {
  await asUser(null, 'anon');
  let a = await access(linked);
  expect(a.hasLink === true && a.url === null && a.revealAt, 'anon learns when, not the link');
  await asUser(AMY);
  expect((await query('select status from public.register_for_event($1)', [linked]))[0].status === 'confirmed', 'Amy takes the one spot');
  expect((await access(linked)).url === null, 'confirmed but not yet revealed');
  await asUser(BEN);
  expect((await query('select status from public.register_for_event($1)', [linked]))[0].status === 'waitlisted', 'Ben is waitlisted');
  await asUser(OWNER);
  expect((await access(linked)).url === 'https://zoom.us/j/123?pwd=abc', 'organiser always sees it');
  await query('update public.event_online_links set reveal_at = now() - interval \'1 minute\' where event_id = $1', [linked]);
  await asUser(AMY);
  expect((await access(linked)).url === 'https://zoom.us/j/123?pwd=abc', 'revealed for the confirmed attendee');
  await asUser(BEN);
  expect((await access(linked)).url === null, 'still hidden from the waitlist');
  expect(await access(physical) === null, 'physical events have no link');
});

await test('hidden capacity: Discover shows only whether it is full, except to the organiser', async () => {
  await asUser(OWNER);
  await query('update public.events set hide_capacity = true where id = $1', [linked]);
  await asUser(BEN);
  let row = (await query('select capacity, spots_left, is_online, hide_capacity from public.events_with_counts where id = $1', [linked]))[0];
  expect(row.capacity === null && row.spots_left === 0 && row.is_online && row.hide_capacity, 'full and hidden: 0 spots, no capacity');
  await asUser(OWNER);
  await query('update public.events set capacity = 5 where id = $1', [linked]);
  await asUser(BEN);
  row = (await query('select capacity, spots_left from public.events_with_counts where id = $1', [linked]))[0];
  expect(row.capacity === null && row.spots_left === null, 'not full and hidden: unknown');
  await asUser(OWNER);
  row = (await query('select capacity, spots_left from public.events_with_counts where id = $1', [linked]))[0];
  expect(row.capacity === 5 && row.spots_left >= 3, 'organiser keeps the numbers');
  row = (await query('select capacity, spots_left from public.events_with_counts where id = $1', [physical]))[0];
  expect(row.capacity === 1 && row.spots_left === 1, 'shown capacity is unchanged');
});

await test('online events cannot have Go together groups', async () => {
  await asUser(AMY);
  await rejects('select public.create_group($1,$2,$3,$4,$5)', [linked, '', 4, 'open', 'public'], /in-person events/);
  // Starting a group needs an RSVP first (20261105050527); Amy RSVPs to the physical event
  await admin();
  await query("insert into public.registrations(event_id, user_id, status) values ($1, $2, 'confirmed')", [physical, AMY]);
  await asUser(AMY);
  expect((await query('select public.create_group($1,$2,$3,$4,$5) as id', [physical, '', 4, 'open', 'public']))[0].id, 'physical events still can');
});

await test('becoming physical removes the link; links must appear before the event ends', async () => {
  await asUser(OWNER);
  await rejects('update public.event_online_links set reveal_at = now() + interval \'60 hours\' where event_id = $1', [linked], /before the event ends/);
  const venueId = (await query('select venue_id from public.events where id = $1', [physical]))[0].venue_id;
  await query('update public.events set is_online = false, venue_id = $2 where id = $1', [linked, venueId]);
  expect((await query('select 1 from public.event_online_links where event_id = $1', [linked])).length === 0, 'link removed');
  expect(await access(linked) === null, 'no access for a physical event');
});
} finally {
  console.log(`${passed} passed, ${failed} failed`);
  await db.close();
  if (failed) process.exitCode = 1;
}
