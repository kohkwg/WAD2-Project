// Isolated PostgreSQL verification of supabase/migrations/20261105150000_venue_to_be_announced.sql.
// Never reads .env or uses a database URL. Pass the path to a temporary PGlite runtime module;
// no application dependency is added. Usage:
//   node server/checks/hidden-venues-db.check.mjs <tmp>/node_modules/@electric-sql/pglite/dist/index.js
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the local path to the PGlite runtime module');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const MIGRATION = '20261105150000_venue_to_be_announced.sql';
let passed = 0, failed = 0;
function expect(value, message) { if (!value) throw new Error(message); }
async function test(name, run) {
  try { await run(); passed++; console.log('PASS', name); }
  catch (error) { failed++; console.log('FAIL', name, error.code || '', error.message); }
  finally { await db.exec('reset role'); }
}
async function query(sql, params = []) { return (await db.query(sql, params)).rows; }
async function rejects(sql, params, pattern) {
  try { await query(sql, params); }
  catch (error) { expect(pattern.test(error.message), `Unexpected rejection: ${error.message}`); return; }
  throw new Error('Expected SQL rejection');
}
const OWNER = '30000000-0000-4000-8000-000000000001';
const AMY = '30000000-0000-4000-8000-000000000002';
async function asUser(id, role = 'authenticated') {
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}
async function admin() { await db.exec('reset role'); }
const hours = (n) => new Date(Date.now() + n * 3600e3).toISOString();
const venue = { name: '[TEST] Secret Rooftop', address: '1 Hidden Lane', postal: '188065', lat: 1.2966, lng: 103.8502 };
const backup = { name: '[TEST] Dry Hall', address: '2 Hidden Lane', postal: null, lat: 1.2967, lng: 103.8503 };
const payload = (extra = {}) => ({
  title: '[TEST] Venue check', description: '', startTime: hours(48), endTime: hours(50), capacity: 5,
  requiresApproval: false, isOutdoor: false, venue, backupVenue: null, tags: ['others'], questions: [], ...extra,
});
const create = async (p) => (await query('select public.create_event_with_details(gen_random_uuid(), $1::jsonb) as id', [JSON.stringify(p)]))[0].id;
const eventRow = async (id) => (await query('select venue_id, backup_venue_id, venue_reveal_at from public.events where id = $1', [id]))[0];
const venuesNamed = async (name) => Number((await query('select count(*) from public.venues where name = $1', [name]))[0].count);
// Moves a hidden venue's time into the past, as if the clock had reached it
async function makeDue(id) {
  await admin();
  await db.exec('alter table public.event_hidden_venues disable trigger event_hidden_venues_check');
  await query("update public.event_hidden_venues set reveal_at = now() - interval '1 minute' where event_id = $1", [id]);
  await db.exec('alter table public.event_hidden_venues enable trigger event_hidden_venues_check');
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
create table cron.jobs(name text primary key, schedule text, command text);
create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $$
  insert into cron.jobs values (p_name, p_schedule, p_command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command;
  select 1::bigint $$;
create publication supabase_realtime;
`);
const migrations = (await readdir(root + '/supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
expect(migrations.includes(MIGRATION), 'the migration under test exists');
let legacyId;
for (const name of migrations) {
  if (name === MIGRATION) {
    await query(`insert into auth.users(id,email) values ($1,'owner@example.invalid'),($2,'amy@example.invalid')`, [OWNER, AMY]);
    await asUser(OWNER);
    legacyId = await create(payload({ title: '[TEST] Older event', venue: { ...venue, name: '[TEST] Old Hall' } }));
    await admin();
  }
  await db.exec((await readFile(root + '/supabase/migrations/' + name, 'utf8')).replace('create extension if not exists pg_cron;', '-- local scheduling substitute'));
}

await test('existing events keep their venue, with no reveal time', async () => {
  const row = await eventRow(legacyId);
  expect(row.venue_id && row.venue_reveal_at === null, JSON.stringify(row));
});

await test('the release job runs every minute', async () => {
  const [job] = await query("select schedule, command from cron.jobs where name = 'release-hidden-venues'");
  expect(job?.schedule === '* * * * *' && job.command.includes('release_due_event_venues'), JSON.stringify(job));
});

await test('a physical event can be published with its venue to be announced', async () => {
  await asUser(OWNER);
  const id = await create(payload({ venue: null }));
  const row = await eventRow(id);
  expect(row.venue_id === null && row.backup_venue_id === null && row.venue_reveal_at === null, JSON.stringify(row));
});

await test('a venue to be announced has no rain plan yet', async () => {
  await asUser(OWNER);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)',
    [JSON.stringify(payload({ venue: null, isOutdoor: true, backupVenue: backup }))], /Choose the venue before adding a rain plan/);
});

let hiddenId;
await test('a hidden venue stays out of the public venues table until its time', async () => {
  await asUser(OWNER);
  hiddenId = await create(payload({ isOutdoor: true, backupVenue: backup, venueRevealAt: hours(24) }));
  const row = await eventRow(hiddenId);
  expect(row.venue_id === null && row.backup_venue_id === null && row.venue_reveal_at, JSON.stringify(row));
  expect(await venuesNamed(venue.name) === 0 && await venuesNamed(backup.name) === 0, 'no venue rows yet');
});

await test('only the event organisers can read the hidden venue', async () => {
  await asUser(OWNER);
  const own = await query('select venue, backup_venue from public.event_hidden_venues where event_id = $1', [hiddenId]);
  expect(own.length === 1 && own[0].venue.name === venue.name && own[0].backup_venue.name === backup.name, 'owner reads it');
  await asUser(AMY);
  expect((await query('select * from public.event_hidden_venues where event_id = $1', [hiddenId])).length === 0, 'Amy reads nothing');
  await asUser(null, 'anon');
  await rejects('select * from public.event_hidden_venues', [], /permission denied/);
});

await test('everyone sees when the venue will appear, never the venue', async () => {
  await asUser(null, 'anon');
  const [row] = await query('select venue_id, venue_reveal_at, lat, lng from public.events_with_counts where id = $1', [hiddenId]);
  expect(row && row.venue_id === null && row.venue_reveal_at && row.lat === null, JSON.stringify(row));
});

await test('the reveal time must come before the start, and needs a venue', async () => {
  await asUser(OWNER);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)',
    [JSON.stringify(payload({ venueRevealAt: hours(49) }))], /revealed before the event starts/);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)',
    [JSON.stringify(payload({ venue: null, venueRevealAt: hours(24) }))], /Choose the venue to keep hidden/);
  await rejects('select public.create_event_with_details(gen_random_uuid(), $1::jsonb)',
    [JSON.stringify(payload({ isOnline: true, venue: null, venueRevealAt: hours(24) }))], /Online events have no venue to hide/);
});

await test('a reveal time already passed shows the venue straight away', async () => {
  await asUser(OWNER);
  const id = await create(payload({ venue: { ...venue, name: '[TEST] Shown now' }, venueRevealAt: hours(-1) }));
  const row = await eventRow(id);
  expect(row.venue_id && row.venue_reveal_at === null, JSON.stringify(row));
  expect((await query('select * from public.event_hidden_venues where event_id = $1', [id])).length === 0, 'nothing hidden');
});

await test('the public reveal time and venue cannot be set around the hidden venue', async () => {
  await asUser(OWNER);
  await rejects('update public.events set venue_reveal_at = now() + interval \'1 day\' where id = $1', [legacyId], /set by saving the hidden venue/);
  const [{ venue_id: oldVenue }] = await query('select venue_id from public.events where id = $1', [legacyId]);
  await rejects('update public.events set venue_id = $2 where id = $1', [hiddenId, oldVenue], /events_hidden_venue_not_public/);
  await rejects('update public.events set is_online = true where id = $1', [hiddenId], /events_hidden_venue_not_public/);
});

await test('another user cannot hide or change a venue on someone else’s event', async () => {
  await asUser(AMY);
  await rejects('insert into public.event_hidden_venues(event_id, venue, reveal_at) values ($1, $2::jsonb, now() + interval \'1 day\')',
    [legacyId, JSON.stringify(venue)], /row-level security/);
  const changed = await query('update public.event_hidden_venues set reveal_at = now() + interval \'2 hours\' where event_id = $1 returning event_id', [hiddenId]);
  expect(changed.length === 0, 'Amy changed nothing');
});

await test('hiding an existing public venue takes it off the event; un-hiding leaves it to be announced', async () => {
  await asUser(OWNER);
  await query('insert into public.event_hidden_venues(event_id, venue, reveal_at) values ($1, $2::jsonb, now() + interval \'1 day\')', [legacyId, JSON.stringify(venue)]);
  let row = await eventRow(legacyId);
  expect(row.venue_id === null && row.venue_reveal_at, JSON.stringify(row));
  await rejects('insert into public.event_hidden_venues(event_id, venue, reveal_at) values ($1, $2::jsonb, now() + interval \'1 day\') on conflict (event_id) do update set reveal_at = excluded.reveal_at + interval \'5 days\'',
    [legacyId, JSON.stringify(venue)], /revealed before the event starts/);
  await rejects('update public.event_hidden_venues set venue = $2::jsonb where event_id = $1', [legacyId, JSON.stringify({ name: 'x' })], /needs a name, address/);
  await query('delete from public.event_hidden_venues where event_id = $1', [legacyId]);
  row = await eventRow(legacyId);
  expect(row.venue_id === null && row.venue_reveal_at === null, JSON.stringify(row));
});

await test('Go together waits for a hidden venue', async () => {
  await asUser(AMY);
  await rejects('select public.create_group($1)', [hiddenId], /once it’s revealed/);
});

await test('when the time comes the hidden venue becomes an ordinary venue for everyone', async () => {
  await asUser(null, 'anon');
  expect(Number((await query('select public.release_due_event_venues() as n'))[0].n) === 0, 'nothing due yet');
  await makeDue(hiddenId);
  await asUser(null, 'anon');
  expect(Number((await query('select public.release_due_event_venues() as n'))[0].n) === 1, 'released one');
  const [row] = await query(`select e.venue_reveal_at, v.name, v.is_indoor, b.name as backup_name, w.lat
    from public.events e join public.venues v on v.id = e.venue_id join public.venues b on b.id = e.backup_venue_id
    join public.events_with_counts w on w.id = e.id where e.id = $1`, [hiddenId]);
  expect(row && row.name === venue.name && row.is_indoor === false && row.backup_name === backup.name && row.venue_reveal_at === null && row.lat, JSON.stringify(row));
  await admin();
  expect((await query('select * from public.event_hidden_venues where event_id = $1', [hiddenId])).length === 0, 'hidden row gone');
  expect(Number((await query('select count(*) from public.event_created_venues where original_event_id = $1', [hiddenId]))[0].count) === 2, 'cleanup rows');
  expect(Number((await query('select public.release_due_event_venues() as n'))[0].n) === 0, 'a second run changes nothing');
});

await test('a released venue lets Go together start (past the venue check)', async () => {
  await asUser(AMY);
  await rejects('select public.create_group($1)', [hiddenId], /RSVP to this event first/);
});

await test('online events are still refused for Go together', async () => {
  await asUser(OWNER);
  const id = await create(payload({ isOnline: true, venue: null }));
  await asUser(AMY);
  await rejects('select public.create_group($1)', [id], /online events can’t have one/);
});
} catch (error) {
  failed++;
  console.log('FAIL setup', error.code || '', error.message);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
